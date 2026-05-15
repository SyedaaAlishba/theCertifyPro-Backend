const logger = require('./logger');

/**
 * Swappable Email Service
 * 
 * To use a real provider (e.g. SendGrid):
 * 1. npm install @sendgrid/mail
 * 2. Add SENDGRID_API_KEY to .env
 * 3. Update the logic below
 */

const emailService = {
  /**
   * Send a generic email
   * @param {string} to - Recipient email
   * @param {string} subject - Email subject
   * @param {string} text - Plain text content
   * @param {string} html - HTML content (optional)
   */
  send: async (to, subject, text, html) => {
    try {
      const isProduction = process.env.NODE_ENV === 'production';
      const provider = process.env.EMAIL_PROVIDER || 'mock';

      if (provider === 'mock') {
        logger.info(`[Email Mock] ✉️  To: ${to} | Subject: ${subject}`);
        logger.info(`[Email Content] ${text}`);
        return true;
      }

      // Placeholder for SendGrid logic
      if (provider === 'sendgrid') {
        // const sgMail = require('@sendgrid/mail');
        // sgMail.setApiKey(process.env.SENDGRID_API_KEY);
        // await sgMail.send({ to, from: process.env.EMAIL_FROM, subject, text, html });
        logger.info(`[Email SendGrid] Sending to ${to}...`);
        return true;
      }

      throw new Error(`Unknown email provider: ${provider}`);
    } catch (err) {
      logger.error('Failed to send email', { error: err.message, to, subject });
      return false;
    }
  },

  /**
   * Send Password Reset Email
   */
  sendPasswordReset: async (to, token) => {
    const resetUrl = `${process.env.CLIENT_URL || 'http://localhost:3000'}/reset-password?token=${token}`;
    const subject = '🔐 Reset your CertifyPro password';
    const text = `You requested a password reset. Please click the link below to set a new password:\n\n${resetUrl}\n\nThis link expires in 1 hour. If you didn't request this, please ignore this email.`;
    const html = `<p>You requested a password reset for <b>CertifyPro</b>.</p><p><a href="${resetUrl}">Click here to reset your password</a></p><p>This link expires in 1 hour.</p>`;
    
    return await emailService.send(to, subject, text, html);
  }
};

module.exports = emailService;
