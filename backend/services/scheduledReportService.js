const cron = require('node-cron');
const reportService = require('./reportService');
const emailService = require('./emailService');
const { isServerless } = require('../config/env');

class ScheduledReportService {
  constructor() {
    this.jobs = new Map();
    this.schedules = [
      // Daily report at 8 AM
      {
        id: 'daily-report',
        schedule: '0 8 * * *',
        name: 'Daily Comprehensive Report',
        enabled: true,
        config: {
          reportType: 'comprehensive',
          dateRange: 'yesterday',
          wards: [],
          format: 'pdf',
          recipients: []
        }
      },
      // Weekly report every Monday at 9 AM
      {
        id: 'weekly-report',
        schedule: '0 9 * * 1',
        name: 'Weekly Performance Report',
        enabled: false,
        config: {
          reportType: 'performance',
          dateRange: 'last7days',
          wards: [],
          format: 'pdf',
          recipients: []
        }
      },
      // Monthly report on 1st of every month at 10 AM
      {
        id: 'monthly-report',
        schedule: '0 10 1 * *',
        name: 'Monthly Occupancy Report',
        enabled: false,
        config: {
          reportType: 'occupancy',
          dateRange: 'lastMonth',
          wards: [],
          format: 'pdf',
          recipients: []
        }
      }
    ];
  }

  async initialize() {
    console.log('🕐 Initializing scheduled report service...');
    
    // Start enabled schedules
    this.schedules.forEach(schedule => {
      if (schedule.enabled) {
        this.startSchedule(schedule);
      }
    });

    console.log(`✅ Scheduled report service initialized with ${this.jobs.size} active jobs`);
  }

  startSchedule(schedule) {
    // Cron needs a long-lived process; serverless functions are frozen between requests
    if (isServerless) return;

    if (this.jobs.has(schedule.id)) {
      console.log(`⚠️  Schedule ${schedule.id} already running`);
      return;
    }

    const job = cron.schedule(schedule.schedule, async () => {
      console.log(`📊 Running scheduled report: ${schedule.name}`);
      await this.executeScheduledReport(schedule);
    });

    this.jobs.set(schedule.id, job);
    console.log(`✅ Started schedule: ${schedule.name} (${schedule.schedule})`);
  }

  stopSchedule(scheduleId) {
    const job = this.jobs.get(scheduleId);
    if (job) {
      job.stop();
      this.jobs.delete(scheduleId);
      console.log(`🛑 Stopped schedule: ${scheduleId}`);
      return true;
    }
    return false;
  }

  async executeScheduledReport(schedule) {
    try {
      // Generate report data
      const reportData = await reportService.generateReportData(schedule.config);

      let reportBuffer, fileName;

      // Generate report in specified format
      if (schedule.config.format === 'pdf') {
        const pdfResult = await reportService.generatePDF(reportData);
        reportBuffer = pdfResult.buffer;
        fileName = pdfResult.fileName;
      } else if (schedule.config.format === 'csv') {
        const csvResult = await reportService.generateCSV(reportData);
        reportBuffer = Buffer.from(csvResult.csv);
        fileName = csvResult.fileName;
      }

      // Send emails if recipients are configured
      if (schedule.config.recipients && schedule.config.recipients.length > 0 && emailService.isConfigured()) {
        await emailService.sendScheduledReport(
          schedule.config.recipients,
          reportBuffer,
          fileName,
          schedule.name,
          schedule.config.format
        );
        console.log(`✅ Scheduled report sent to ${schedule.config.recipients.length} recipients`);
      } else {
        console.log(`ℹ️  Report generated but no recipients configured for ${schedule.name}`);
      }

      return {
        success: true,
        fileName,
        recipientCount: schedule.config.recipients?.length || 0
      };
    } catch (error) {
      console.error(`❌ Error executing scheduled report ${schedule.name}:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  getSchedules() {
    return this.schedules.map(schedule => ({
      ...schedule,
      isRunning: this.jobs.has(schedule.id)
    }));
  }

  updateSchedule(scheduleId, updates) {
    const scheduleIndex = this.schedules.findIndex(s => s.id === scheduleId);
    if (scheduleIndex === -1) {
      return { success: false, message: 'Schedule not found' };
    }

    // Stop existing job if running
    this.stopSchedule(scheduleId);

    // Update schedule
    this.schedules[scheduleIndex] = {
      ...this.schedules[scheduleIndex],
      ...updates
    };

    // Restart if enabled
    if (this.schedules[scheduleIndex].enabled) {
      this.startSchedule(this.schedules[scheduleIndex]);
    }

    return {
      success: true,
      schedule: this.schedules[scheduleIndex]
    };
  }

  async runScheduleNow(scheduleId) {
    const schedule = this.schedules.find(s => s.id === scheduleId);
    if (!schedule) {
      return { success: false, message: 'Schedule not found' };
    }

    console.log(`▶️  Manually running schedule: ${schedule.name}`);
    return await this.executeScheduledReport(schedule);
  }

  shutdown() {
    console.log('🛑 Shutting down scheduled report service...');
    this.jobs.forEach((job, scheduleId) => {
      job.stop();
      console.log(`  Stopped: ${scheduleId}`);
    });
    this.jobs.clear();
    console.log('✅ Scheduled report service shut down');
  }
}

module.exports = new ScheduledReportService();
