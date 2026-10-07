const PDFDocument = require('pdfkit');
const Bed = require('../models/Bed');
const OccupancyLog = require('../models/OccupancyLog');
const CleaningLog = require('../models/CleaningLog');
const Report = require('../models/Report');

const DAY_MS = 24 * 60 * 60 * 1000;

// Standard rates used for the financial estimates (USD per bed)
const RATES = {
  revenuePerBedDay: 1500,
  cleaningCost: 150,
  monthlyMaintenance: 200
};

const COLORS = {
  primary: '#0891b2',
  dark: '#0f172a',
  text: '#334155',
  muted: '#64748b',
  light: '#f1f5f9',
  border: '#e2e8f0',
  green: '#16a34a',
  amber: '#d97706',
  red: '#dc2626'
};

const money = (value) => `$${Math.round(value).toLocaleString('en-US')}`;

class ReportService {
  getDateRange(dateRange) {
    const endDate = new Date();
    const startDate = new Date();
    switch (dateRange) {
      case 'today':
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'yesterday':
        startDate.setDate(startDate.getDate() - 1);
        startDate.setHours(0, 0, 0, 0);
        endDate.setDate(endDate.getDate() - 1);
        endDate.setHours(23, 59, 59, 999);
        break;
      case 'last30days':
        startDate.setDate(startDate.getDate() - 30);
        break;
      case 'last90days':
        startDate.setDate(startDate.getDate() - 90);
        break;
      case 'thisMonth':
        startDate.setDate(1);
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'lastMonth':
        startDate.setMonth(startDate.getMonth() - 1, 1);
        startDate.setHours(0, 0, 0, 0);
        endDate.setDate(0);
        endDate.setHours(23, 59, 59, 999);
        break;
      case 'last7days':
      default:
        startDate.setDate(startDate.getDate() - 7);
    }
    return { startDate, endDate };
  }

  async generateReportData(options = {}) {
    const { reportType = 'comprehensive', dateRange = 'last7days' } = options;
    const wards = Array.isArray(options.wards) ? options.wards : [];
    const filterByWard = wards.length > 0 && !wards.includes('All Wards');

    const beds = await Bed.find(filterByWard ? { ward: { $in: wards } } : {}).lean();
    const totalBeds = beds.length;
    const occupiedBeds = beds.filter(bed => bed.status === 'occupied').length;
    const availableBeds = beds.filter(bed => bed.status === 'available').length;
    const cleaningBeds = beds.filter(bed => bed.status === 'cleaning').length;
    const occupancyRate = totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0;

    // Group by ward
    const wardStats = {};
    const wardByBed = new Map();
    beds.forEach(bed => {
      if (!wardStats[bed.ward]) {
        wardStats[bed.ward] = { total: 0, occupied: 0, available: 0, cleaning: 0 };
      }
      wardStats[bed.ward].total++;
      wardStats[bed.ward][bed.status]++;
      wardByBed.set(String(bed._id), bed.ward);
    });

    const { startDate, endDate } = this.getDateRange(dateRange);
    const daysDiff = Math.max(1, (endDate - startDate) / DAY_MS);
    const bedIds = beds.map(bed => bed._id);

    // Admissions / discharges from startDate until now. Events after endDate are
    // only needed to rewind the current occupancy back to the report period.
    const logs = await OccupancyLog.find({
      bedId: { $in: bedIds },
      statusChange: { $in: ['assigned', 'released'] },
      timestamp: { $gte: startDate }
    })
      .sort({ timestamp: 1 })
      .select('bedId statusChange timestamp')
      .lean();

    const periodLogs = logs.filter(log => log.timestamp <= endDate);
    const admissions = periodLogs.filter(log => log.statusChange === 'assigned').length;
    const discharges = periodLogs.filter(log => log.statusChange === 'released').length;
    const dailyAdmissions = Math.round(admissions / daysDiff);
    const dailyDischarges = Math.round(discharges / daysDiff);

    // Rewind occupancy event by event: walking backwards, an admission means the
    // bed was free before it and a discharge means it was occupied before it.
    let occupiedCount = occupiedBeds;
    const occupiedByWard = Object.fromEntries(Object.entries(wardStats).map(([ward, s]) => [ward, s.occupied]));
    let cursor = new Date();
    let bedDays = 0;
    const bedDaysByWard = Object.fromEntries(Object.keys(wardStats).map(ward => [ward, 0]));
    let peakCount = null;
    let lowCount = null;

    const accumulate = (from, to) => {
      const lo = Math.max(from.getTime(), startDate.getTime());
      const hi = Math.min(to.getTime(), endDate.getTime());
      if (hi <= lo) return;
      const days = (hi - lo) / DAY_MS;
      bedDays += occupiedCount * days;
      Object.keys(bedDaysByWard).forEach(ward => {
        bedDaysByWard[ward] += occupiedByWard[ward] * days;
      });
      peakCount = peakCount === null ? occupiedCount : Math.max(peakCount, occupiedCount);
      lowCount = lowCount === null ? occupiedCount : Math.min(lowCount, occupiedCount);
    };

    for (let i = logs.length - 1; i >= 0; i--) {
      const log = logs[i];
      accumulate(log.timestamp, cursor);
      const delta = log.statusChange === 'assigned' ? -1 : 1;
      const ward = wardByBed.get(String(log.bedId));
      occupiedCount = Math.max(0, Math.min(totalBeds, occupiedCount + delta));
      if (ward) occupiedByWard[ward] = Math.max(0, occupiedByWard[ward] + delta);
      cursor = log.timestamp;
    }
    accumulate(startDate, cursor);

    const toRate = (count) => (totalBeds > 0 ? Math.round((count / totalBeds) * 100) : 0);
    const peakOccupancy = toRate(peakCount ?? occupiedBeds);
    const lowOccupancy = toRate(lowCount ?? occupiedBeds);
    const avgOccupancy = totalBeds > 0 ? Math.round((bedDays / daysDiff / totalBeds) * 100) : 0;

    // Average length of stay: completed stays (admission -> discharge) ending in the period
    const openStay = new Map();
    let totalStayDays = 0;
    let stayCount = 0;
    const stayLogs = await OccupancyLog.find({
      bedId: { $in: bedIds },
      statusChange: { $in: ['assigned', 'released'] },
      timestamp: { $gte: new Date(startDate.getTime() - 14 * DAY_MS), $lte: endDate }
    })
      .sort({ timestamp: 1 })
      .select('bedId statusChange timestamp')
      .lean();

    for (const log of stayLogs) {
      const key = String(log.bedId);
      if (log.statusChange === 'assigned') {
        openStay.set(key, log.timestamp);
      } else if (openStay.has(key)) {
        if (log.timestamp >= startDate) {
          totalStayDays += (log.timestamp - openStay.get(key)) / DAY_MS;
          stayCount++;
        }
        openStay.delete(key);
      }
    }
    const avgLengthOfStay = stayCount > 0 ? (totalStayDays / stayCount).toFixed(1) : 'N/A';

    // Cleaning turnaround from completed cleaning logs
    const cleanings = await CleaningLog.find({
      bedId: { $in: bedIds },
      status: 'completed',
      endTime: { $gte: startDate, $lte: endDate }
    })
      .select('actualDuration estimatedDuration')
      .lean();

    const cleaningEvents = cleanings.length;
    const avgCleaningMinutes = cleaningEvents > 0
      ? Math.round(cleanings.reduce((sum, c) => sum + (c.actualDuration || 0), 0) / cleaningEvents)
      : null;
    const onTimeCleanings = cleanings.filter(c => (c.actualDuration || 0) <= (c.estimatedDuration || 0)).length;
    const cleaningCompliance = cleaningEvents > 0 ? Math.round((onTimeCleanings / cleaningEvents) * 100) : null;

    const bedTurnoverRate = totalBeds > 0 ? (discharges / totalBeds).toFixed(2) : '0';

    // Financial estimates, normalised to a 30 day month
    const dailyRevenue = (bedDays * RATES.revenuePerBedDay) / daysDiff;
    const monthlyRevenue = dailyRevenue * 30;
    const dailyCleaningCost = (cleaningEvents * RATES.cleaningCost) / daysDiff;
    const monthlyCleaningCost = dailyCleaningCost * 30;
    const estimatedMonthlyMaintenance = totalBeds * RATES.monthlyMaintenance;
    const netRevenue = monthlyRevenue - monthlyCleaningCost - estimatedMonthlyMaintenance;

    const financial = {
      dailyRevenue,
      monthlyRevenue,
      dailyCleaningCost,
      monthlyCleaningCost,
      estimatedMonthlyMaintenance,
      netRevenue,
      revenuePerBed: totalBeds > 0 ? Math.round(monthlyRevenue / totalBeds) : 0,
      profitMargin: monthlyRevenue > 0 ? ((netRevenue / monthlyRevenue) * 100).toFixed(1) : '0'
    };

    const performance = {
      utilizationRate: occupancyRate,
      avgOccupancy,
      avgCleaningMinutes,
      avgLengthOfStay,
      admissions,
      discharges,
      dailyAdmissions,
      dailyDischarges,
      bedTurnoverRate
    };

    const baseData = {
      reportType,
      dateRange,
      generatedDate: new Date().toISOString(),
      summary: { totalBeds, occupiedBeds, availableBeds, cleaningBeds, occupancyRate },
      wardStats,
      selectedWards: filterByWard ? wards : ['All Wards'],
      dateRangeLabel: this.getDateRangeLabel(dateRange),
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString()
    };

    switch (reportType) {
      case 'financial':
        return {
          ...baseData,
          financial,
          costBreakdown: {
            staffingCost: Math.round(monthlyRevenue * 0.35),
            facilitiesCost: Math.round(monthlyRevenue * 0.15),
            suppliesCost: Math.round(monthlyRevenue * 0.10),
            otherCosts: Math.round(monthlyRevenue * 0.05)
          },
          revenueByWard: Object.fromEntries(
            Object.entries(bedDaysByWard).map(([ward, days]) => [
              ward,
              Math.round(((days * RATES.revenuePerBedDay) / daysDiff) * 30)
            ])
          )
        };

      case 'performance':
        return {
          ...baseData,
          performance,
          kpis: {
            avgCleaningTime: avgCleaningMinutes !== null ? `${avgCleaningMinutes} min` : 'N/A',
            dischargeEfficiency: admissions > 0 ? `${Math.min(100, Math.round((discharges / admissions) * 100))}%` : 'N/A',
            cleaningTimeCompliance: cleaningCompliance !== null ? `${cleaningCompliance}%` : 'N/A',
            cleaningsCompleted: cleaningEvents
          }
        };

      case 'occupancy':
        return {
          ...baseData,
          occupancyDetails: {
            utilizationRate: occupancyRate,
            avgOccupancy,
            availabilityRate: toRate(availableBeds),
            maintenanceRate: toRate(cleaningBeds),
            peakOccupancy,
            lowOccupancy
          }
        };

      case 'comprehensive':
      default:
        return { ...baseData, financial, performance };
    }
  }

  getDateRangeLabel(dateRange) {
    const labels = {
      'today': 'Today',
      'yesterday': 'Yesterday',
      'last7days': 'Last 7 Days',
      'last30days': 'Last 30 Days',
      'last90days': 'Last 90 Days',
      'thisMonth': 'This Month',
      'lastMonth': 'Last Month'
    };
    return labels[dateRange] || 'Last 7 Days';
  }

  getReportTypeLabel(type) {
    const labels = {
      'comprehensive': 'Comprehensive Report',
      'occupancy': 'Occupancy Report',
      'financial': 'Financial Report',
      'performance': 'Performance Report',
      'custom': 'Custom Report'
    };
    return labels[type] || 'Report';
  }

  /**
   * Render the report as a PDF buffer (pure JS - no headless browser needed)
   */
  renderPDF(data) {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const left = doc.page.margins.left;
      const width = doc.page.width - left - doc.page.margins.right;
      const bottom = () => doc.page.height - doc.page.margins.bottom - 20;

      const ensureSpace = (height) => {
        if (doc.y + height > bottom()) doc.addPage();
      };

      const sectionTitle = (title) => {
        ensureSpace(90);
        doc.moveDown(1.2);
        doc.font('Helvetica-Bold').fontSize(13).fillColor(COLORS.dark).text(title, left, doc.y);
        const y = doc.y + 4;
        doc.moveTo(left, y).lineTo(left + width, y).lineWidth(1).strokeColor(COLORS.border).stroke();
        doc.moveTo(left, y).lineTo(left + 36, y).lineWidth(2).strokeColor(COLORS.primary).stroke();
        doc.y = y + 12;
      };

      const cards = (items) => {
        const gap = 10;
        const cardWidth = (width - gap * (items.length - 1)) / items.length;
        const cardHeight = 62;
        ensureSpace(cardHeight + 10);
        const y = doc.y;
        items.forEach((item, i) => {
          const x = left + i * (cardWidth + gap);
          doc.roundedRect(x, y, cardWidth, cardHeight, 5).fillColor(COLORS.light).fill();
          doc.rect(x, y + 6, 3, cardHeight - 12).fillColor(item.color || COLORS.primary).fill();
          doc.font('Helvetica').fontSize(8).fillColor(COLORS.muted)
            .text(item.label.toUpperCase(), x + 12, y + 11, { width: cardWidth - 18, characterSpacing: 0.4 });
          doc.font('Helvetica-Bold').fontSize(17).fillColor(COLORS.dark)
            .text(String(item.value), x + 12, y + 25, { width: cardWidth - 18 });
          if (item.note) {
            doc.font('Helvetica').fontSize(8).fillColor(COLORS.muted)
              .text(item.note, x + 12, y + 46, { width: cardWidth - 18 });
          }
        });
        doc.y = y + cardHeight + 10;
      };

      const table = (headers, rows, widths) => {
        const rowHeight = 22;
        const colWidths = widths.map(w => w * width);
        const drawRow = (cells, { header = false, striped = false } = {}) => {
          ensureSpace(rowHeight);
          const y = doc.y;
          if (header) doc.rect(left, y, width, rowHeight).fillColor(COLORS.dark).fill();
          else if (striped) doc.rect(left, y, width, rowHeight).fillColor(COLORS.light).fill();
          let x = left;
          cells.forEach((cell, i) => {
            doc.font(header || i === 0 ? 'Helvetica-Bold' : 'Helvetica')
              .fontSize(9)
              .fillColor(header ? '#ffffff' : COLORS.text)
              .text(String(cell), x + 8, y + 7, {
                width: colWidths[i] - 16,
                align: i === 0 ? 'left' : 'right',
                lineBreak: false
              });
            x += colWidths[i];
          });
          doc.y = y + rowHeight;
        };
        drawRow(headers, { header: true });
        rows.forEach((row, i) => drawRow(row, { striped: i % 2 === 1 }));
        doc.y += 4;
      };

      const rateColor = (rate) => (rate >= 90 ? COLORS.red : rate >= 75 ? COLORS.amber : COLORS.green);

      // ---- Header ----
      doc.rect(0, 0, doc.page.width, 92).fillColor(COLORS.dark).fill();
      doc.rect(0, 92, doc.page.width, 3).fillColor(COLORS.primary).fill();
      doc.font('Helvetica-Bold').fontSize(20).fillColor('#ffffff').text('Bed Manager', left, 28);
      doc.font('Helvetica').fontSize(11).fillColor('#cbd5e1')
        .text(`Hospital Bed Management  |  ${this.getReportTypeLabel(data.reportType)}`, left, 54);
      doc.font('Helvetica').fontSize(9).fillColor('#cbd5e1')
        .text(new Date(data.generatedDate).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }), left, 32, {
          width,
          align: 'right'
        });

      // ---- Meta ----
      const fmtDate = (iso) => new Date(iso).toLocaleDateString('en-GB', { dateStyle: 'medium' });
      doc.y = 112;
      doc.font('Helvetica').fontSize(9).fillColor(COLORS.muted)
        .text(`Period: ${data.dateRangeLabel} (${fmtDate(data.startDate)} - ${fmtDate(data.endDate)})`, left, doc.y, {
          width: width / 2
        });
      doc.text(`Wards: ${data.selectedWards.join(', ')}`, left, 112, { width, align: 'right' });
      doc.y = 126;

      // ---- Summary ----
      const { summary } = data;
      sectionTitle('Current Bed Status');
      cards([
        { label: 'Total Beds', value: summary.totalBeds },
        { label: 'Occupied', value: summary.occupiedBeds, note: `${summary.occupancyRate}% occupancy`, color: rateColor(summary.occupancyRate) },
        { label: 'Available', value: summary.availableBeds, color: COLORS.green },
        { label: 'Cleaning', value: summary.cleaningBeds, color: COLORS.amber }
      ]);

      sectionTitle('Ward Breakdown');
      table(
        ['Ward', 'Total', 'Occupied', 'Available', 'Cleaning', 'Occupancy'],
        Object.entries(data.wardStats).map(([ward, s]) => [
          ward,
          s.total,
          s.occupied,
          s.available,
          s.cleaning,
          `${s.total > 0 ? Math.round((s.occupied / s.total) * 100) : 0}%`
        ]),
        [0.25, 0.15, 0.15, 0.15, 0.15, 0.15]
      );

      // ---- Occupancy details ----
      if (data.occupancyDetails) {
        const o = data.occupancyDetails;
        sectionTitle('Occupancy Details');
        cards([
          { label: 'Average Occupancy', value: `${o.avgOccupancy}%`, note: 'over the period' },
          { label: 'Peak Occupancy', value: `${o.peakOccupancy}%`, color: rateColor(o.peakOccupancy) },
          { label: 'Lowest Occupancy', value: `${o.lowOccupancy}%`, color: COLORS.green },
          { label: 'Available Now', value: `${o.availabilityRate}%`, color: COLORS.green }
        ]);
        table(['Metric', 'Value'], [
          ['Current utilization', `${o.utilizationRate}%`],
          ['Beds in cleaning / maintenance', `${o.maintenanceRate}%`]
        ], [0.7, 0.3]);
      }

      // ---- Performance ----
      if (data.performance) {
        const p = data.performance;
        sectionTitle('Performance Metrics');
        cards([
          { label: 'Average Occupancy', value: `${p.avgOccupancy}%`, note: 'over the period' },
          { label: 'Avg Length of Stay', value: p.avgLengthOfStay, note: 'days' },
          { label: 'Admissions', value: p.admissions, note: `${p.dailyAdmissions} per day` },
          { label: 'Discharges', value: p.discharges, note: `${p.dailyDischarges} per day` }
        ]);
        table(['Metric', 'Value'], [
          ['Average cleaning turnaround', p.avgCleaningMinutes !== null ? `${p.avgCleaningMinutes} min` : 'N/A'],
          ['Bed turnover (discharges per bed)', p.bedTurnoverRate],
          ['Current utilization', `${p.utilizationRate}%`]
        ], [0.7, 0.3]);
      }

      if (data.kpis) {
        const k = data.kpis;
        sectionTitle('Key Performance Indicators');
        table(['KPI', 'Value'], [
          ['Average cleaning time', k.avgCleaningTime],
          ['Cleanings completed', k.cleaningsCompleted],
          ['Cleaning time compliance (within estimate)', k.cleaningTimeCompliance],
          ['Discharge efficiency (discharges / admissions)', k.dischargeEfficiency]
        ], [0.7, 0.3]);
      }

      // ---- Financial ----
      if (data.financial) {
        const f = data.financial;
        sectionTitle('Financial Estimates');
        cards([
          { label: 'Monthly Revenue', value: money(f.monthlyRevenue), color: COLORS.green },
          { label: 'Net Revenue', value: money(f.netRevenue), note: `${f.profitMargin}% margin`, color: COLORS.green },
          { label: 'Revenue / Bed', value: money(f.revenuePerBed), note: 'per month' },
          { label: 'Daily Revenue', value: money(f.dailyRevenue) }
        ]);
        table(['Item', 'Daily', 'Monthly'], [
          ['Bed revenue', money(f.dailyRevenue), money(f.monthlyRevenue)],
          ['Cleaning costs', money(f.dailyCleaningCost), money(f.monthlyCleaningCost)],
          ['Maintenance (estimated)', money(f.estimatedMonthlyMaintenance / 30), money(f.estimatedMonthlyMaintenance)],
          ['Net', money(f.netRevenue / 30), money(f.netRevenue)]
        ], [0.5, 0.25, 0.25]);
      }

      if (data.costBreakdown) {
        const c = data.costBreakdown;
        sectionTitle('Operating Cost Breakdown');
        table(['Category', 'Monthly Amount', 'Share of Revenue'], [
          ['Staffing', money(c.staffingCost), '35%'],
          ['Facilities', money(c.facilitiesCost), '15%'],
          ['Supplies', money(c.suppliesCost), '10%'],
          ['Other', money(c.otherCosts), '5%']
        ], [0.5, 0.25, 0.25]);
      }

      if (data.revenueByWard) {
        sectionTitle('Revenue by Ward');
        table(
          ['Ward', 'Monthly Revenue'],
          Object.entries(data.revenueByWard).map(([ward, revenue]) => [ward, money(revenue)]),
          [0.7, 0.3]
        );
      }

      if (data.financial) {
        doc.moveDown(0.6);
        doc.font('Helvetica-Oblique').fontSize(8).fillColor(COLORS.muted).text(
          `Financial figures are estimates based on occupied bed-days at ${money(RATES.revenuePerBedDay)} per bed-day, ` +
          `${money(RATES.cleaningCost)} per cleaning and ${money(RATES.monthlyMaintenance)} monthly maintenance per bed.`,
          left,
          doc.y,
          { width }
        );
      }

      // ---- Footer on every page ----
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        const y = doc.page.height - 32;
        // Writing below the bottom margin would otherwise trigger a new page
        doc.page.margins.bottom = 0;
        doc.font('Helvetica').fontSize(8).fillColor(COLORS.muted)
          .text('Generated by Bed Manager', left, y, { width: width / 2, lineBreak: false });
        doc.text(`Page ${i + 1} of ${range.count}`, left, y, { width, align: 'right', lineBreak: false });
      }

      doc.end();
    });
  }

  async saveReport(fileName, format, buffer, reportData, userId) {
    try {
      await Report.create({
        fileName,
        format,
        reportType: reportData.reportType,
        size: buffer.length,
        data: buffer,
        generatedBy: userId || null
      });
    } catch (error) {
      // History is a convenience - never fail the download because of it
      console.error('Error saving report to history:', error.message);
    }
  }

  async generatePDF(reportData, userId = null) {
    const buffer = await this.renderPDF(reportData);
    const fileName = `report_${reportData.reportType}_${Date.now()}.pdf`;
    await this.saveReport(fileName, 'pdf', buffer, reportData, userId);
    return { buffer, fileName };
  }

  async generateCSV(reportData, userId = null) {
    const escape = (value) => {
      const text = String(value ?? '');
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };

    const rows = [['Ward', 'Total Beds', 'Occupied Beds', 'Available Beds', 'Cleaning Beds', 'Occupancy Rate (%)']];
    const addRow = (ward, stats) => rows.push([
      ward,
      stats.total,
      stats.occupied,
      stats.available,
      stats.cleaning || 0,
      stats.total > 0 ? Math.round((stats.occupied / stats.total) * 100) : 0
    ]);

    Object.entries(reportData.wardStats).forEach(([ward, stats]) => addRow(ward, stats));
    const { summary } = reportData;
    addRow('Total', {
      total: summary.totalBeds,
      occupied: summary.occupiedBeds,
      available: summary.availableBeds,
      cleaning: summary.cleaningBeds
    });

    const csv = rows.map(row => row.map(escape).join(',')).join('\n');
    const fileName = `report_${reportData.reportType}_${Date.now()}.csv`;
    await this.saveReport(fileName, 'csv', Buffer.from(csv), reportData, userId);

    return { csv, fileName };
  }

  async getReportHistory(limit = 20) {
    const reports = await Report.find({})
      .sort({ createdAt: -1 })
      .limit(Math.min(Math.max(limit, 1), 100))
      .lean();

    return reports.map(report => ({
      fileName: report.fileName,
      size: report.size,
      createdAt: report.createdAt,
      reportType: report.reportType,
      type: report.format.toUpperCase()
    }));
  }

  async deleteReport(fileName) {
    const result = await Report.deleteOne({ fileName });
    return result.deletedCount > 0;
  }

  async getReport(fileName) {
    const report = await Report.findOne({ fileName }).select('+data');
    return report ? report.data : null;
  }
}

module.exports = new ReportService();
