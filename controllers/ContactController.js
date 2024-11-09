// controllers/ContactController.js

const ContactMessage = require('../models/ContactMessage');
const sendEmail = require('../services/emailService');
const { validationResult } = require('express-validator');
const logger = require('../utils/logger');

exports.submitContactMessage = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    // Return all validation errors
    return res.status(400).json({ errors: errors.array() });
  }

  const { name, email, message, termsAgreed } = req.body;

  try {
    const contactMessage = await ContactMessage.create({ name, email, message, termsAgreed });
    logger.info(`Contact message saved: ${contactMessage._id}`);

    const emailServiceEnabled = process.env.EMAIL_SERVICE_ENABLED === 'true';
    if (emailServiceEnabled) {
      await sendEmail({
        email: process.env.SUPPORT_EMAIL,
        subject: `New Contact Message from ${name}`,
        message: `You have received a new contact message:\n\nName: ${name}\nEmail: ${email}\nMessage: ${message}`,
      });
      logger.info(`Notification email sent for contact message: ${contactMessage._id}`);
    }

    res.status(200).json({ message: 'Contact message submitted successfully' });
  } catch (error) {
    logger.error(`Error saving contact message: ${error.message}`);
    res.status(500).json({ message: 'Server error. Please try again later.' });
  }
};

exports.getAllContactMessages = async (req, res) => {
  try {
    const messages = await ContactMessage.find().sort({ createdAt: -1 });
    res.status(200).json(messages);
  } catch (error) {
    logger.error(`Error fetching contact messages: ${error.message}`);
    res.status(500).json({ message: 'Server error. Please try again later.' });
  }
};

exports.deleteContactMessage = async (req, res) => {
  try {
    const { id } = req.params;
    const message = await ContactMessage.findById(id);

    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }

    await message.remove();
    logger.info(`Contact message deleted: ${id}`);
    res.status(200).json({ message: 'Contact message deleted successfully' });
  } catch (error) {
    logger.error(`Error deleting contact message: ${error.message}`);
    res.status(500).json({ message: 'Server error. Please try again later.' });
  }
};
