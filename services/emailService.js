const sgMail = require('@sendgrid/mail');
const logger = require('../utils/logger');

const emailService = process.env.EMAIL_SERVICE; // Should be 'sendgrid'

// Validate that the email service is set to 'sendgrid'
if (emailService !== 'sendgrid') {
  logger.error(`Unsupported email service: ${emailService}`);
  throw new Error('Unsupported email service. Please set EMAIL_SERVICE=sendgrid in your .env file.');
}

// Configure SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

/**
 * Send an email using SendGrid
 * @param {Object} options - Email options
 * @param {string} options.email - Recipient email address
 * @param {string} options.subject - Email subject
 * @param {string} options.message - Plain text message content
 * @param {string} options.html - HTML message content
 * @returns {Promise<void>}
 */
const sendEmail = async ({ email, subject, message, html }) => {
  try {
    // Send email using SendGrid
    const msg = {
      to: email,
      from: process.env.FROM_EMAIL, // Must be a verified sender in SendGrid
      subject,
      text: message,
      html, // Add the HTML content
    };
    await sgMail.send(msg);
    logger.info(`Email sent to ${email} via SendGrid`);
  } catch (error) {
    logger.error(`Failed to send email to ${email} via SendGrid: ${error.message}`);
    throw new Error('Email could not be sent');
  }
};

module.exports = sendEmail;
