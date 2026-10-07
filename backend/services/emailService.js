const nodemailer = require('nodemailer');

class EmailService {
  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT) || 587,
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
  }

  isConfigured() {
    return Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
  }

  async sendReportEmail(to, subject, reportBuffer, fileName, format = 'pdf') {
    try {
      const mailOptions = {
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to,
        subject: subject || 'Hospital Bed Management Report',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #4a90e2;">Hospital Bed Management Report</h2>
            <p>Please find the attached report generated from the Hospital Bed Management System.</p>
            
            <div style="background: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;">
              <h3 style="margin-top: 0;">Report Details</h3>
              <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
              <p><strong>Format:</strong> ${format.toUpperCase()}</p>
              <p><strong>File:</strong> ${fileName}</p>
            </div>
            
            <p style="color: #666; font-size: 14px;">
              This is an automated email from the Hospital Bed Management System. 
              Please do not reply to this email.
            </p>
          </div>
        `,
        attachments: [
          {
            filename: fileName,
            content: reportBuffer,
            contentType: format === 'pdf' ? 'application/pdf' : 'text/csv'
          }
        ]
      };

      const info = await this.transporter.sendMail(mailOptions);
      console.log('Email sent successfully:', info.messageId);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error('Error sending email:', error);
      throw error;
    }
  }

  async sendScheduledReport(recipients, reportBuffer, fileName, reportType, format) {
    try {
      const subject = `Scheduled ${reportType} Report - ${new Date().toLocaleDateString()}`;
      
      const results = await Promise.all(
        recipients.map(recipient => 
          this.sendReportEmail(recipient, subject, reportBuffer, fileName, format)
        )
      );

      return {
        success: true,
        sent: results.length,
        recipients
      };
    } catch (error) {
      console.error('Error sending scheduled reports:', error);
      throw error;
    }
  }

  async testConnection() {
    try {
      await this.transporter.verify();
      return { success: true, message: 'Email service is ready' };
    } catch (error) {
      console.error('Email service error:', error);
      return { success: false, message: error.message };
    }
  }
}

module.exports = new EmailService();
