import React, { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { fetchBeds } from '@/features/beds/bedsSlice';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
import { Calendar } from 'lucide-react';
import { FileText, Download, Mail, Printer, CheckCircle } from 'lucide-react';
import api from '@/services/api';

const ReportGenerator = () => {
  const dispatch = useDispatch();
  const { bedsList, status } = useSelector((state) => state.beds);
  const [reportType, setReportType] = useState('comprehensive');
  const [dateRange, setDateRange] = useState('last7days');
  const [selectedWards, setSelectedWards] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [reportGenerated, setReportGenerated] = useState(false);
  const [wards, setWards] = useState(['All Wards']);
  const [recentReports, setRecentReports] = useState([]);
  const [emailAddress, setEmailAddress] = useState('');
  const [isEmailing, setIsEmailing] = useState(false);
  const [emailFormat, setEmailFormat] = useState('pdf');

  useEffect(() => {
    if (status === 'idle') {
      dispatch(fetchBeds());
    }
  }, [dispatch, status]);

  // Load recent reports from localStorage
  useEffect(() => {
    const savedReports = localStorage.getItem('recentReports');
    if (savedReports) {
      try {
        setRecentReports(JSON.parse(savedReports));
      } catch (error) {
        console.error('Error loading recent reports:', error);
        setRecentReports([]);
      }
    }
  }, []);

  useEffect(() => {
    // Extract unique wards from beds data
    const uniqueWards = ['All Wards', ...new Set(bedsList.map(bed => bed.ward))];
    setWards(uniqueWards);
  }, [bedsList]);

  const reportTypes = [
    { value: 'comprehensive', label: 'Comprehensive Report', description: 'Full analysis of all metrics' },
    { value: 'occupancy', label: 'Occupancy Report', description: 'Bed occupancy and utilization' },
    { value: 'financial', label: 'Financial Report', description: 'Revenue and cost analysis' },
    { value: 'performance', label: 'Performance Report', description: 'KPI and efficiency metrics' },
    { value: 'custom', label: 'Custom Report', description: 'Select specific metrics' },
  ];

  const metrics = [
    { id: 'occupancy', label: 'Occupancy Rate' },
    { id: 'turnover', label: 'Bed Turnover Rate' },
    { id: 'avgStay', label: 'Average Length of Stay' },
    { id: 'admissions', label: 'Admission Statistics' },
    { id: 'discharges', label: 'Discharge Statistics' },
    { id: 'cleaning', label: 'Cleaning & Maintenance' },
  ];

  const handleGenerateReport = async () => {
    setIsGenerating(true);

    try {
      const wardsToSend = selectedWards.length > 0 && !selectedWards.includes('All Wards')
        ? selectedWards
        : [];

      // Generate PDF from backend
      const response = await api.post('/reports/generate/pdf', {
        reportType,
        dateRange,
        wards: wardsToSend
      }, {
        responseType: 'blob'
      });

      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `report_${Date.now()}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      // Save to history
      const reportData = generateReportData();
      saveReportToHistory(reportData);

      setIsGenerating(false);
      setReportGenerated(true);
      setTimeout(() => setReportGenerated(false), 3000);
    } catch (error) {
      console.error('Error generating report:', error);
      setIsGenerating(false);
      alert('Failed to generate report. Please try again.');
    }
  };

  const saveReportToHistory = (reportData) => {
    const reportRecord = {
      id: Date.now(),
      name: `${reportTypes.find(t => t.value === reportData.reportType)?.label} - ${new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`,
      date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      timestamp: new Date().toISOString(),
      size: '1.2 MB', // Approximate size
      data: reportData // Store the actual report data
    };

    const updatedReports = [reportRecord, ...recentReports].slice(0, 10); // Keep only last 10 reports
    setRecentReports(updatedReports);
    localStorage.setItem('recentReports', JSON.stringify(updatedReports));
  };

  const downloadSavedReport = (report) => {
    if (report.data) {
      downloadReport(report.data);
    } else {
      alert('Report data not available. Please generate a new report.');
    }
  };

  const deleteReport = (reportId) => {
    const updatedReports = recentReports.filter(r => r.id !== reportId);
    setRecentReports(updatedReports);
    localStorage.setItem('recentReports', JSON.stringify(updatedReports));
  };

  const generateReportData = () => {
    // Filter beds by selected wards
    let filteredBeds = bedsList;
    if (selectedWards.length > 0 && !selectedWards.includes('All Wards')) {
      filteredBeds = bedsList.filter(bed => selectedWards.includes(bed.ward));
    }

    const totalBeds = filteredBeds.length;
    const occupiedBeds = filteredBeds.filter(bed => bed.status === 'occupied').length;
    const availableBeds = filteredBeds.filter(bed => bed.status === 'available').length;
    const cleaningBeds = filteredBeds.filter(bed => bed.status === 'cleaning').length;
    const occupancyRate = totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0;

    // Group beds by ward
    const wardStats = {};
    filteredBeds.forEach(bed => {
      if (!wardStats[bed.ward]) {
        wardStats[bed.ward] = { total: 0, occupied: 0, available: 0, cleaning: 0 };
      }
      wardStats[bed.ward].total++;
      wardStats[bed.ward][bed.status]++;
    });

    // Calculate financial metrics
    const avgRevPerBed = 1500; // Base revenue per occupied bed per day
    const cleaningCostPerBed = 150;
    const maintenanceCostPerBed = 200;
    const dailyRevenue = occupiedBeds * avgRevPerBed;
    const dailyCleaningCost = cleaningBeds * cleaningCostPerBed;
    const monthlyRevenue = dailyRevenue * 30;
    const monthlyCleaningCost = dailyCleaningCost * 30;
    const estimatedMonthlyMaintenance = totalBeds * maintenanceCostPerBed;
    const netRevenue = monthlyRevenue - monthlyCleaningCost - estimatedMonthlyMaintenance;

    // Calculate performance metrics
    const avgTurnoverTime = 4.5; // hours
    const avgLengthOfStay = 3.2; // days
    const utilizationRate = occupancyRate;
    const dailyAdmissions = Math.round(occupiedBeds * 0.15); // estimated
    const dailyDischarges = Math.round(occupiedBeds * 0.12); // estimated
    const bedTurnoverRate = totalBeds > 0 ? (dailyDischarges / totalBeds * 100).toFixed(1) : 0;

    // Base data structure
    const baseData = {
      reportType,
      dateRange,
      generatedDate: new Date().toLocaleString(),
      selectedWards: selectedWards.length > 0 ? selectedWards : ['All Wards'],
      summary: {
        totalBeds,
        occupiedBeds,
        availableBeds,
        cleaningBeds,
        occupancyRate
      },
      wardStats
    };

    // Add type-specific data
    switch(reportType) {
      case 'comprehensive':
        return {
          ...baseData,
          financial: {
            dailyRevenue,
            monthlyRevenue,
            dailyCleaningCost,
            monthlyCleaningCost,
            estimatedMonthlyMaintenance,
            netRevenue,
            revenuePerBed: totalBeds > 0 ? Math.round(monthlyRevenue / totalBeds) : 0
          },
          performance: {
            utilizationRate,
            avgTurnoverTime,
            avgLengthOfStay,
            dailyAdmissions,
            dailyDischarges,
            bedTurnoverRate
          },
          operationalEfficiency: {
            cleaningEfficiency: cleaningBeds < totalBeds * 0.1 ? 'Excellent' : 'Needs Improvement',
            occupancyTrend: occupancyRate > 85 ? 'High' : occupancyRate > 70 ? 'Moderate' : 'Low',
            capacityUtilization: `${utilizationRate}%`
          }
        };

      case 'occupancy':
        return {
          ...baseData,
          occupancyDetails: {
            utilizationRate,
            availabilityRate: Math.round((availableBeds / totalBeds) * 100),
            maintenanceRate: Math.round((cleaningBeds / totalBeds) * 100),
            peakOccupancy: Math.min(100, occupancyRate + 5),
            lowOccupancy: Math.max(0, occupancyRate - 10),
            avgDailyOccupancy: occupiedBeds
          },
          trends: {
            weekdayAvg: occupancyRate + 3,
            weekendAvg: occupancyRate - 5,
            monthlyGrowth: '+2.5%'
          }
        };

      case 'financial':
        return {
          ...baseData,
          financial: {
            dailyRevenue,
            monthlyRevenue,
            dailyCleaningCost,
            monthlyCleaningCost,
            estimatedMonthlyMaintenance,
            netRevenue,
            revenuePerBed: totalBeds > 0 ? Math.round(monthlyRevenue / totalBeds) : 0,
            profitMargin: monthlyRevenue > 0 ? ((netRevenue / monthlyRevenue) * 100).toFixed(1) : 0
          },
          costBreakdown: {
            staffingCost: Math.round(monthlyRevenue * 0.35),
            facilitiesCost: Math.round(monthlyRevenue * 0.15),
            suppliesCost: Math.round(monthlyRevenue * 0.10),
            otherCosts: Math.round(monthlyRevenue * 0.05)
          },
          revenueByWard: Object.entries(wardStats).reduce((acc, [ward, stats]) => {
            acc[ward] = stats.occupied * avgRevPerBed * 30;
            return acc;
          }, {})
        };

      case 'performance':
        return {
          ...baseData,
          performance: {
            utilizationRate,
            avgTurnoverTime,
            avgLengthOfStay,
            dailyAdmissions,
            dailyDischarges,
            bedTurnoverRate
          },
          kpis: {
            patientSatisfaction: '87%',
            avgWaitTime: '1.2 hours',
            dischargeEfficiency: '92%',
            cleaningTimeCompliance: '95%'
          },
          staffingMetrics: {
            nurseToBedRatio: (totalBeds / 8).toFixed(1),
            avgResponseTime: '3.5 minutes',
            shiftCoverage: '98%'
          }
        };

      case 'custom':
        return {
          ...baseData,
          customMetrics: {
            // Include all available metrics for custom reports
            occupancy: { rate: occupancyRate, count: occupiedBeds },
            availability: { rate: Math.round((availableBeds / totalBeds) * 100), count: availableBeds },
            turnover: { rate: bedTurnoverRate, avgTime: avgTurnoverTime },
            lengthOfStay: avgLengthOfStay,
            admissions: dailyAdmissions,
            discharges: dailyDischarges,
            cleaning: { count: cleaningBeds, rate: Math.round((cleaningBeds / totalBeds) * 100) }
          }
        };

      default:
        return baseData;
    }
  };

  const downloadReport = (data) => {
    // Generate report content
    let content = `HOSPITAL BED MANAGEMENT REPORT\n`;
    content += `${'='.repeat(80)}\n\n`;
    content += `Report Type: ${reportTypes.find(t => t.value === data.reportType)?.label}\n`;
    content += `Date Range: ${dateRange.replace(/([A-Z])/g, ' $1').trim()}\n`;
    content += `Generated: ${data.generatedDate}\n`;
    content += `Wards: ${data.selectedWards.join(', ')}\n\n`;

    content += `EXECUTIVE SUMMARY\n`;
    content += `${'-'.repeat(80)}\n`;
    content += `Total Beds: ${data.summary.totalBeds}\n`;
    content += `Occupied: ${data.summary.occupiedBeds} (${data.summary.occupancyRate}%)\n`;
    content += `Available: ${data.summary.availableBeds}\n`;
    content += `Cleaning: ${data.summary.cleaningBeds}\n\n`;

    // Add type-specific content
    if (data.reportType === 'comprehensive' || data.reportType === 'financial') {
      if (data.financial) {
        content += `FINANCIAL ANALYSIS\n`;
        content += `${'-'.repeat(80)}\n`;
        content += `Daily Revenue: $${data.financial.dailyRevenue.toLocaleString()}\n`;
        content += `Monthly Revenue: $${data.financial.monthlyRevenue.toLocaleString()}\n`;
        content += `Monthly Cleaning Cost: $${data.financial.monthlyCleaningCost.toLocaleString()}\n`;
        content += `Monthly Maintenance: $${data.financial.estimatedMonthlyMaintenance.toLocaleString()}\n`;
        content += `Net Revenue: $${data.financial.netRevenue.toLocaleString()}\n`;
        content += `Revenue per Bed: $${data.financial.revenuePerBed.toLocaleString()}\n`;
        if (data.financial.profitMargin) {
          content += `Profit Margin: ${data.financial.profitMargin}%\n`;
        }
        content += `\n`;

        if (data.costBreakdown) {
          content += `COST BREAKDOWN\n`;
          content += `${'-'.repeat(80)}\n`;
          content += `Staffing: $${data.costBreakdown.staffingCost.toLocaleString()}\n`;
          content += `Facilities: $${data.costBreakdown.facilitiesCost.toLocaleString()}\n`;
          content += `Supplies: $${data.costBreakdown.suppliesCost.toLocaleString()}\n`;
          content += `Other: $${data.costBreakdown.otherCosts.toLocaleString()}\n\n`;
        }

        if (data.revenueByWard) {
          content += `REVENUE BY WARD\n`;
          content += `${'-'.repeat(80)}\n`;
          Object.entries(data.revenueByWard).forEach(([ward, revenue]) => {
            content += `${ward}: $${revenue.toLocaleString()}\n`;
          });
          content += `\n`;
        }
      }
    }

    if (data.reportType === 'comprehensive' || data.reportType === 'performance') {
      if (data.performance) {
        content += `PERFORMANCE METRICS\n`;
        content += `${'-'.repeat(80)}\n`;
        content += `Utilization Rate: ${data.performance.utilizationRate}%\n`;
        content += `Bed Turnover Rate: ${data.performance.bedTurnoverRate}%\n`;
        content += `Average Turnover Time: ${data.performance.avgTurnoverTime} hours\n`;
        content += `Average Length of Stay: ${data.performance.avgLengthOfStay} days\n`;
        content += `Daily Admissions: ${data.performance.dailyAdmissions}\n`;
        content += `Daily Discharges: ${data.performance.dailyDischarges}\n\n`;
      }

      if (data.kpis) {
        content += `KEY PERFORMANCE INDICATORS\n`;
        content += `${'-'.repeat(80)}\n`;
        content += `Patient Satisfaction: ${data.kpis.patientSatisfaction}\n`;
        content += `Average Wait Time: ${data.kpis.avgWaitTime}\n`;
        content += `Discharge Efficiency: ${data.kpis.dischargeEfficiency}\n`;
        content += `Cleaning Compliance: ${data.kpis.cleaningTimeCompliance}\n\n`;
      }

      if (data.staffingMetrics) {
        content += `STAFFING METRICS\n`;
        content += `${'-'.repeat(80)}\n`;
        content += `Nurse-to-Bed Ratio: 1:${data.staffingMetrics.nurseToBedRatio}\n`;
        content += `Average Response Time: ${data.staffingMetrics.avgResponseTime}\n`;
        content += `Shift Coverage: ${data.staffingMetrics.shiftCoverage}\n\n`;
      }
    }

    if (data.reportType === 'occupancy') {
      if (data.occupancyDetails) {
        content += `OCCUPANCY DETAILS\n`;
        content += `${'-'.repeat(80)}\n`;
        content += `Utilization Rate: ${data.occupancyDetails.utilizationRate}%\n`;
        content += `Availability Rate: ${data.occupancyDetails.availabilityRate}%\n`;
        content += `Maintenance Rate: ${data.occupancyDetails.maintenanceRate}%\n`;
        content += `Peak Occupancy: ${data.occupancyDetails.peakOccupancy}%\n`;
        content += `Low Occupancy: ${data.occupancyDetails.lowOccupancy}%\n`;
        content += `Average Daily Occupancy: ${data.occupancyDetails.avgDailyOccupancy} beds\n\n`;
      }

      if (data.trends) {
        content += `OCCUPANCY TRENDS\n`;
        content += `${'-'.repeat(80)}\n`;
        content += `Weekday Average: ${data.trends.weekdayAvg}%\n`;
        content += `Weekend Average: ${data.trends.weekendAvg}%\n`;
        content += `Monthly Growth: ${data.trends.monthlyGrowth}\n\n`;
      }
    }

    if (data.operationalEfficiency) {
      content += `OPERATIONAL EFFICIENCY\n`;
      content += `${'-'.repeat(80)}\n`;
      content += `Cleaning Efficiency: ${data.operationalEfficiency.cleaningEfficiency}\n`;
      content += `Occupancy Trend: ${data.operationalEfficiency.occupancyTrend}\n`;
      content += `Capacity Utilization: ${data.operationalEfficiency.capacityUtilization}\n\n`;
    }

    content += `WARD-WISE BREAKDOWN\n`;
    content += `${'-'.repeat(80)}\n`;
    Object.entries(data.wardStats).forEach(([ward, stats]) => {
      const wardOccupancy = stats.total > 0 ? Math.round((stats.occupied / stats.total) * 100) : 0;
      content += `\n${ward}:\n`;
      content += `  Total Beds: ${stats.total}\n`;
      content += `  Occupied: ${stats.occupied} (${wardOccupancy}%)\n`;
      content += `  Available: ${stats.available}\n`;
      content += `  Cleaning: ${stats.cleaning}\n`;
    });

    content += `\n${'='.repeat(80)}\n`;
    content += `End of Report\n`;

    // Create blob and download
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const reportTypeName = reportTypes.find(t => t.value === data.reportType)?.label.replace(/\s+/g, '_') || 'Report';
    a.download = `${reportTypeName}_${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const printReport = (data) => {
    // Generate HTML content for printing
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Please allow pop-ups to print the report');
      return;
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Bed Management Report</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            margin: 40px;
            color: #333;
          }
          h1 {
            border-bottom: 3px solid #333;
            padding-bottom: 10px;
          }
          h2 {
            color: #555;
            margin-top: 30px;
            border-bottom: 2px solid #ddd;
            padding-bottom: 5px;
          }
          .info-grid {
            display: grid;
            grid-template-columns: 200px 1fr;
            gap: 10px;
            margin: 20px 0;
          }
          .info-label {
            font-weight: bold;
          }
          .summary-box {
            background: #f5f5f5;
            padding: 20px;
            border-radius: 5px;
            margin: 20px 0;
          }
          .ward-section {
            margin: 20px 0;
            padding: 15px;
            border-left: 4px solid #4a90e2;
            background: #f9f9f9;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
          }
          th, td {
            border: 1px solid #ddd;
            padding: 12px;
            text-align: left;
          }
          th {
            background-color: #4a90e2;
            color: white;
          }
          @media print {
            body { margin: 20px; }
          }
        </style>
      </head>
      <body>
        <h1>Hospital Bed Management Report</h1>
        
        <div class="info-grid">
          <div class="info-label">Report Type:</div>
          <div>${reportTypes.find(t => t.value === data.reportType)?.label}</div>
          
          <div class="info-label">Date Range:</div>
          <div>${dateRange.replace(/([A-Z])/g, ' $1').trim()}</div>
          
          <div class="info-label">Generated:</div>
          <div>${data.generatedDate}</div>
          
          <div class="info-label">Selected Wards:</div>
          <div>${data.selectedWards.join(', ')}</div>
        </div>

        <h2>Executive Summary</h2>
        <div class="summary-box">
          <table>
            <tr>
              <th>Metric</th>
              <th>Value</th>
            </tr>
            <tr>
              <td>Total Beds</td>
              <td>${data.summary.totalBeds}</td>
            </tr>
            <tr>
              <td>Occupied Beds</td>
              <td>${data.summary.occupiedBeds} (${data.summary.occupancyRate}%)</td>
            </tr>
            <tr>
              <td>Available Beds</td>
              <td>${data.summary.availableBeds}</td>
            </tr>
            <tr>
              <td>Cleaning</td>
              <td>${data.summary.cleaningBeds}</td>
            </tr>
          </table>
        </div>

        <h2>Ward-wise Breakdown</h2>
        ${Object.entries(data.wardStats).map(([ward, stats]) => {
      const wardOccupancy = stats.total > 0 ? Math.round((stats.occupied / stats.total) * 100) : 0;
      return `
            <div class="ward-section">
              <h3>${ward}</h3>
              <table>
                <tr>
                  <th>Metric</th>
                  <th>Value</th>
                </tr>
                <tr>
                  <td>Total Beds</td>
                  <td>${stats.total}</td>
                </tr>
                <tr>
                  <td>Occupied</td>
                  <td>${stats.occupied} (${wardOccupancy}%)</td>
                </tr>
                <tr>
                  <td>Available</td>
                  <td>${stats.available}</td>
                </tr>
                <tr>
                  <td>Cleaning</td>
                  <td>${stats.cleaning}</td>
                </tr>
              </table>
            </div>
          `;
    }).join('')}

        <hr style="margin-top: 40px; border: none; border-top: 2px solid #333;">
        <p style="text-align: center; color: #666;">End of Report</p>
      </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();

    // Wait for content to load, then print
    printWindow.onload = () => {
      printWindow.print();
    };
  };

  const toggleWard = (ward) => {
    setSelectedWards((prev) =>
      prev.includes(ward) ? prev.filter((w) => w !== ward) : [...prev, ward]
    );
  };

  const handleEmailReport = async () => {
    if (!emailAddress) {
      alert('Please enter an email address');
      return;
    }

    if (!emailAddress.includes('@')) {
      alert('Please enter a valid email address');
      return;
    }

    setIsEmailing(true);

    try {
      const wardsToSend = selectedWards.length > 0 && !selectedWards.includes('All Wards')
        ? selectedWards
        : [];

      await api.post('/reports/email', {
        reportType,
        dateRange,
        wards: wardsToSend,
        email: emailAddress,
        format: emailFormat
      });

      alert(`Report sent successfully to ${emailAddress}!`);
      setEmailAddress('');
      setIsEmailing(false);
    } catch (error) {
      console.error('Error sending email:', error);
      alert(error.response?.data?.message || 'Failed to send email. Please try again.');
      setIsEmailing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Report Configuration */}
      <Card className="bg-neutral-900 border-neutral-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <FileText className="w-5 h-5 text-blue-400" />
            Generate Report
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Report Type Selection */}
          <div className="space-y-4">
            <Label className="text-slate-300 block mt-2">Report Type</Label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {reportTypes.map((type) => (
                <div
                  key={type.value}
                  onClick={() => setReportType(type.value)}
                  className={`p-4 rounded-lg border cursor-pointer transition-all ${reportType === type.value
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-neutral-700 bg-neutral-900 hover:border-neutral-600'
                    }`}
                >
                  <div className="flex items-start justify-between text-left">
                    <div className="text-left">
                      <h4 className="font-semibold text-white mb-1 text-left">{type.label}</h4>
                      <p className="text-sm text-neutral-400 text-left">{type.description}</p>
                    </div>
                    {reportType === type.value && (
                      <CheckCircle className="w-5 h-5 text-blue-400" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Date Range */}
          <div className="space-y-4">
            <Label className="text-slate-300 block mt-2">Date Range</Label>
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="border-neutral-600">
                <Calendar className="w-4 h-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="yesterday">Yesterday</SelectItem>
                <SelectItem value="last7days">Last 7 Days</SelectItem>
                <SelectItem value="last30days">Last 30 Days</SelectItem>
                <SelectItem value="last90days">Last 90 Days</SelectItem>
                <SelectItem value="thisMonth">This Month</SelectItem>
                <SelectItem value="lastMonth">Last Month</SelectItem>
                <SelectItem value="custom">Custom Range</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Ward Selection */}
          <div className="space-y-4">
            <Label className="text-slate-300 block mt-2">Select Wards</Label>
            <div className="grid grid-cols-2 gap-3">
              {wards.map((ward) => (
                <div
                  key={ward}
                  className="flex items-center space-x-2 p-3 rounded-lg bg-neutral-900 border border-neutral-700"
                >
                  <Checkbox
                    id={ward}
                    checked={selectedWards.includes(ward)}
                    onCheckedChange={() => toggleWard(ward)}
                    className="border-neutral-600"
                  />
                  <label
                    htmlFor={ward}
                    className="text-sm text-slate-300 cursor-pointer select-none"
                  >
                    {ward}
                  </label>
                </div>
              ))}
            </div>
          </div>

          {/* Metrics Selection (for custom reports) */}
          {reportType === 'custom' && (
            <div className="space-y-3">
              <Label className="text-slate-300">Include Metrics</Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {metrics.map((metric) => (
                  <div
                    key={metric.id}
                    className="flex items-center space-x-2 p-3 rounded-lg bg-neutral-900 border border-neutral-700"
                  >
                    <Checkbox id={metric.id} className="border-neutral-600" />
                    <label
                      htmlFor={metric.id}
                      className="text-sm text-slate-300 cursor-pointer select-none"
                    >
                      {metric.label}
                    </label>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Generate Button */}
          <Button
            onClick={handleGenerateReport}
            disabled={isGenerating}
            className="w-full h-12 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white"
          >
            {isGenerating ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent mr-2" />
                Generating Report...
              </>
            ) : reportGenerated ? (
              <>
                <CheckCircle className="w-5 h-5 mr-2" />
                Report Generated Successfully!
              </>
            ) : (
              <>
                <FileText className="w-5 h-5 mr-2" />
                Generate Report
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Email Report Section */}
      <Card className="bg-neutral-900 border-neutral-700">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Mail className="w-5 h-5 text-green-400" />
            Email Report
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-slate-300 mb-2 block">Email Address</Label>
              <Input
                type="email"
                placeholder="recipient@example.com"
                value={emailAddress}
                onChange={(e) => setEmailAddress(e.target.value)}
                className="border-neutral-600 bg-neutral-900 text-white"
                disabled={isEmailing}
              />
            </div>
            <div>
              <Label className="text-slate-300 mb-2 block">Format</Label>
              <Select value={emailFormat} onValueChange={setEmailFormat} disabled={isEmailing}>
                <SelectTrigger className="border-neutral-600 bg-neutral-900 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pdf">PDF</SelectItem>
                  <SelectItem value="csv">CSV</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button
            onClick={handleEmailReport}
            disabled={isEmailing || !emailAddress}
            className="w-full bg-green-600 hover:bg-green-700 text-white"
          >
            {isEmailing ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent mr-2" />
                Sending Email...
              </>
            ) : (
              <>
                <Mail className="w-5 h-5 mr-2" />
                Send Report via Email
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card className="bg-neutral-900 border-neutral-700">
        <CardHeader>
          <CardTitle className="text-lg">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Button
              variant="outline"
              className="h-auto flex-col gap-2 py-4 border-neutral-600 hover:bg-neutral-700"
              onClick={async () => {
                try {
                  const wardsToSend = selectedWards.length > 0 && !selectedWards.includes('All Wards')
                    ? selectedWards
                    : [];

                  const response = await api.post('/reports/generate/csv', {
                    reportType,
                    dateRange,
                    wards: wardsToSend
                  }, {
                    responseType: 'blob'
                  });

                  const url = window.URL.createObjectURL(new Blob([response.data]));
                  const link = document.createElement('a');
                  link.href = url;
                  link.setAttribute('download', `report_${Date.now()}.csv`);
                  document.body.appendChild(link);
                  link.click();
                  link.remove();
                  window.URL.revokeObjectURL(url);
                } catch (error) {
                  console.error('Error downloading CSV:', error);
                  alert('Failed to download CSV report');
                }
              }}
            >
              <Download className="w-6 h-6 text-blue-400" />
              <span className="text-sm">Download CSV</span>
            </Button>
            <Button
              variant="outline"
              className="h-auto flex-col gap-2 py-4 border-neutral-600 hover:bg-neutral-700"
              onClick={() => {
                const data = generateReportData();
                printReport(data);
              }}
            >
              <Printer className="w-6 h-6 text-purple-400" />
              <span className="text-sm">Print Report</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Recent Reports */}
      <Card className="bg-neutral-900 border-neutral-700">
        <CardHeader>
          <CardTitle className="text-lg">Recent Reports</CardTitle>
        </CardHeader>
        <CardContent>
          {recentReports.length === 0 ? (
            <div className="text-left py-8 text-neutral-400">
              <FileText className="w-12 h-12 mb-3 opacity-50" />
              <p>No reports generated yet</p>
              <p className="text-sm mt-1">Generate your first report to see it here</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentReports.map((report) => (
                <div
                  key={report.id}
                  className="flex items-center justify-between p-4 rounded-lg bg-neutral-900 border border-neutral-700 hover:border-neutral-600 transition-all"
                >
                  <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-blue-400" />
                    <div>
                      <p className="font-medium text-white">{report.name}</p>
                      <p className="text-xs text-neutral-400">
                        {report.date} • {report.size}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-neutral-600 hover:bg-neutral-700"
                      onClick={() => downloadSavedReport(report)}
                      title="Download report"
                    >
                      <Download className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-neutral-600 hover:bg-red-900/20 hover:border-red-600"
                      onClick={() => deleteReport(report.id)}
                      title="Delete report"
                    >
                      <span className="text-red-400">×</span>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ReportGenerator;
