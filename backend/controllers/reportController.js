const reportService = require('../services/reportService');
const emailService = require('../services/emailService');
const scheduledReportService = require('../services/scheduledReportService');

/**
 * @desc    Generate PDF report
 * @route   POST /api/reports/generate/pdf
 * @access  Private
 */
exports.generatePDFReport = async (req, res) => {
  try {
    console.log('📊 PDF Report generation requested');
    const { reportType, dateRange, wards } = req.body;
    console.log('Config:', { reportType, dateRange, wards: wards?.length || 0 });

    // Generate report data
    console.log('🔍 Fetching report data from database...');
    const reportData = await reportService.generateReportData({
      reportType,
      dateRange,
      wards
    });
    console.log('✅ Report data fetched');

    // Generate PDF
    console.log('📄 Starting PDF generation...');
    const pdfResult = await reportService.generatePDF(reportData, req.user._id);
    console.log('✅ PDF generation complete');

    // Send PDF as response
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${pdfResult.fileName}"`);
    res.send(pdfResult.buffer);
    console.log('✅ PDF sent to client');
  } catch (error) {
    console.error('❌ Generate PDF report error:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating PDF report',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Generate CSV report
 * @route   POST /api/reports/generate/csv
 * @access  Private
 */
exports.generateCSVReport = async (req, res) => {
  try {
    const { reportType, dateRange, wards } = req.body;

    // Generate report data
    const reportData = await reportService.generateReportData({
      reportType,
      dateRange,
      wards
    });

    // Generate CSV
    const csvResult = await reportService.generateCSV(reportData, req.user._id);

    // Send CSV as response
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${csvResult.fileName}"`);
    res.send(csvResult.csv);
  } catch (error) {
    console.error('Generate CSV report error:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating CSV report',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Email report
 * @route   POST /api/reports/email
 * @access  Private
 */
exports.emailReport = async (req, res) => {
  try {
    const { reportType, dateRange, wards, email, format = 'pdf' } = req.body;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'A valid email address is required'
      });
    }

    if (!emailService.isConfigured()) {
      return res.status(503).json({
        success: false,
        message: 'Email delivery is not configured on this server. Download the report instead.'
      });
    }

    // Generate report data
    const reportData = await reportService.generateReportData({
      reportType,
      dateRange,
      wards
    });

    let reportBuffer, fileName;

    // Generate report in specified format
    if (format === 'pdf') {
      const pdfResult = await reportService.generatePDF(reportData);
      reportBuffer = pdfResult.buffer;
      fileName = pdfResult.fileName;
    } else if (format === 'csv') {
      const csvResult = await reportService.generateCSV(reportData);
      reportBuffer = Buffer.from(csvResult.csv);
      fileName = csvResult.fileName;
    } else {
      return res.status(400).json({
        success: false,
        message: 'Invalid format. Must be pdf or csv'
      });
    }

    // Send email
    await emailService.sendReportEmail(email, null, reportBuffer, fileName, format);

    res.status(200).json({
      success: true,
      message: `Report sent to ${email}`,
      format,
      fileName
    });
  } catch (error) {
    console.error('Email report error:', error);
    res.status(500).json({
      success: false,
      message: 'Error emailing report',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Get report history
 * @route   GET /api/reports/history
 * @access  Private
 */
exports.getReportHistory = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const reports = await reportService.getReportHistory(limit);

    res.status(200).json({
      success: true,
      count: reports.length,
      data: reports
    });
  } catch (error) {
    console.error('Get report history error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching report history',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Download report from history
 * @route   GET /api/reports/download/:fileName
 * @access  Private
 */
exports.downloadReport = async (req, res) => {
  try {
    const { fileName } = req.params;

    const buffer = await reportService.getReport(fileName);

    if (!buffer) {
      return res.status(404).json({
        success: false,
        message: 'Report not found'
      });
    }

    const contentType = fileName.endsWith('.pdf') ? 'application/pdf' : 'text/csv';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(buffer);
  } catch (error) {
    console.error('Download report error:', error);
    res.status(500).json({
      success: false,
      message: 'Error downloading report',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Delete report from history
 * @route   DELETE /api/reports/:fileName
 * @access  Private
 */
exports.deleteReport = async (req, res) => {
  try {
    const { fileName } = req.params;

    const deleted = await reportService.deleteReport(fileName);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: 'Report not found or could not be deleted'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Report deleted successfully'
    });
  } catch (error) {
    console.error('Delete report error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting report',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Get scheduled reports
 * @route   GET /api/reports/schedules
 * @access  Private
 */
exports.getSchedules = async (req, res) => {
  try {
    const schedules = scheduledReportService.getSchedules();

    res.status(200).json({
      success: true,
      count: schedules.length,
      data: schedules
    });
  } catch (error) {
    console.error('Get schedules error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching schedules',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Update scheduled report
 * @route   PUT /api/reports/schedules/:scheduleId
 * @access  Private
 */
exports.updateSchedule = async (req, res) => {
  try {
    const { scheduleId } = req.params;
    const updates = req.body;

    const result = scheduledReportService.updateSchedule(scheduleId, updates);

    if (!result.success) {
      return res.status(404).json(result);
    }

    res.status(200).json(result);
  } catch (error) {
    console.error('Update schedule error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating schedule',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Run scheduled report now
 * @route   POST /api/reports/schedules/:scheduleId/run
 * @access  Private
 */
exports.runScheduleNow = async (req, res) => {
  try {
    const { scheduleId } = req.params;

    const result = await scheduledReportService.runScheduleNow(scheduleId);

    if (!result.success) {
      return res.status(404).json(result);
    }

    res.status(200).json({
      success: true,
      message: 'Schedule executed successfully',
      data: result
    });
  } catch (error) {
    console.error('Run schedule error:', error);
    res.status(500).json({
      success: false,
      message: 'Error running schedule',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
