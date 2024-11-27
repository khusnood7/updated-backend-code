// controllers/ContactController.js

const ContactMessage = require('../models/ContactMessage');
const ActivityLog = require('../models/ActivityLog');
const sendEmail = require('../services/emailService');
const { validationResult } = require('express-validator');
const logger = require('../utils/logger');
const { Parser } = require('json2csv'); // Install via npm: npm install json2csv
const User = require('../models/User'); // Assuming you have a User model

/**
 * Submit a new contact message (Public)
 */
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

    // Send acknowledgment email to the user
    if (emailServiceEnabled) {
      await sendEmail({
        email: email,
        subject: `Thank you for contacting us, ${name}`,
        message: `Hello ${name},\n\nThank you for reaching out to us. We have received your message and will get back to you shortly.\n\nBest regards,\nSupport Team`,
      });
      logger.info(`Acknowledgment email sent to user: ${email}`);
    }

    res.status(200).json({ message: 'Contact message submitted successfully' });
  } catch (error) {
    logger.error(`Error saving contact message: ${error.message}`);
    res.status(500).json({ message: 'Server error. Please try again later.' });
  }
};

/**
 * Get all contact messages with pagination, search, and filters (Admin only)
 */
exports.getAllContactMessages = async (req, res) => {
  const { page = 1, limit = 10, search = '', status, startDate, endDate } = req.query;

  const query = { deleted: false };

  if (status) {
    query.status = status;
  }

  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { message: { $regex: search, $options: 'i' } },
    ];
  }

  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) {
      query.createdAt.$gte = new Date(startDate);
    }
    if (endDate) {
      query.createdAt.$lte = new Date(endDate);
    }
  }

  try {
    const messages = await ContactMessage.find(query)
      .populate('assignedTo', 'name email') // Populate assigned admin details
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();

    const total = await ContactMessage.countDocuments(query);

    res.status(200).json({
      data: messages,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    logger.error(`Error fetching contact messages: ${error.message}`);
    res.status(500).json({ message: 'Server error. Please try again later.' });
  }
};

/**
 * Update the status of a contact message (Admin only)
 */
exports.updateMessageStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  // Validate status
  if (!['new', 'in-progress', 'resolved'].includes(status)) {
    return res.status(400).json({ message: 'Invalid status value' });
  }

  try {
    const message = await ContactMessage.findById(id);
    if (!message || message.deleted) {
      return res.status(404).json({ message: 'Message not found' });
    }

    const previousStatus = message.status;
    message.status = status;
    await message.save();

    // Log the action
    await ActivityLog.create({
      action: 'update_status',
      messageId: id,
      performedBy: req.user._id,
      details: `Status changed from ${previousStatus} to ${status}`,
    });

    // Send email notification to user
    if (process.env.EMAIL_SERVICE_ENABLED === 'true') {
      await sendEmail({
        email: message.email,
        subject: `Your Contact Message Status Updated to ${status}`,
        message: `Hello ${message.name},\n\nYour contact message has been updated to "${status}".\n\nThank you.`,
      });
      logger.info(`Status update email sent to user: ${message.email}`);
    }

    res.status(200).json({ message: 'Status updated successfully' });
  } catch (error) {
    logger.error(`Error updating message status: ${error.message}`);
    res.status(500).json({ message: 'Server error. Please try again later.' });
  }
};

/**
 * Assign an admin to a contact message (Admin only)
 */
exports.assignAdminToMessage = async (req, res) => {
  const { id } = req.params;
  const { adminId } = req.body;

  try {
    const admin = await User.findById(adminId);
    if (!admin || !admin.isAdmin) {
      return res.status(400).json({ message: 'Invalid admin user' });
    }

    const message = await ContactMessage.findById(id);
    if (!message || message.deleted) {
      return res.status(404).json({ message: 'Message not found' });
    }

    const previousAssignment = message.assignedTo;
    message.assignedTo = adminId;
    await message.save();

    // Log the action
    await ActivityLog.create({
      action: 'assign',
      messageId: id,
      performedBy: req.user._id,
      details: `Assigned to admin: ${adminId}`,
    });

    res.status(200).json({ message: 'Admin assigned successfully' });
  } catch (error) {
    logger.error(`Error assigning admin to message: ${error.message}`);
    res.status(500).json({ message: 'Server error. Please try again later.' });
  }
};

/**
 * Respond to a contact message (Admin only)
 */
exports.respondToMessage = async (req, res) => {
  const { id } = req.params;
  const { responseMessage } = req.body;

  if (!responseMessage || responseMessage.trim().length < 10) {
    return res.status(400).json({ message: 'Response message must be at least 10 characters long' });
  }

  try {
    const message = await ContactMessage.findById(id);
    if (!message || message.deleted) {
      return res.status(404).json({ message: 'Message not found' });
    }

    // Add response to the message
    message.responses.push({
      responder: req.user._id,
      message: responseMessage.trim(),
    });
    await message.save();

    // Log the action
    await ActivityLog.create({
      action: 'respond',
      messageId: id,
      performedBy: req.user._id,
      details: `Responded to message`,
    });

    // Send response email to user
    if (process.env.EMAIL_SERVICE_ENABLED === 'true') {
      await sendEmail({
        email: message.email,
        subject: `Response to Your Contact Message`,
        message: `Hello ${message.name},\n\n${responseMessage}\n\nBest regards,\nSupport Team`,
      });
      logger.info(`Response email sent to user: ${message.email}`);
    }

    res.status(200).json({ message: 'Response sent successfully' });
  } catch (error) {
    logger.error(`Error responding to message: ${error.message}`);
    res.status(500).json({ message: 'Server error. Please try again later.' });
  }
};

/**
 * Soft delete a contact message (Admin only)
 */
exports.softDeleteContactMessage = async (req, res) => {
  const { id } = req.params;

  try {
    const message = await ContactMessage.findById(id);
    if (!message || message.deleted) {
      return res.status(404).json({ message: 'Message not found or already deleted' });
    }

    message.deleted = true;
    await message.save();

    // Log the action
    await ActivityLog.create({
      action: 'delete',
      messageId: id,
      performedBy: req.user._id,
      details: `Soft deleted message`,
    });

    res.status(200).json({ message: 'Message soft deleted successfully' });
  } catch (error) {
    logger.error(`Error soft deleting message: ${error.message}`);
    res.status(500).json({ message: 'Server error. Please try again later.' });
  }
};

/**
 * Restore a soft-deleted contact message (Admin only)
 */
exports.restoreContactMessage = async (req, res) => {
  const { id } = req.params;

  try {
    const message = await ContactMessage.findById(id);
    if (!message || !message.deleted) {
      return res.status(404).json({ message: 'Message not found or not deleted' });
    }

    message.deleted = false;
    await message.save();

    // Log the action
    await ActivityLog.create({
      action: 'restore',
      messageId: id,
      performedBy: req.user._id,
      details: `Restored message`,
    });

    res.status(200).json({ message: 'Message restored successfully' });
  } catch (error) {
    logger.error(`Error restoring message: ${error.message}`);
    res.status(500).json({ message: 'Server error. Please try again later.' });
  }
};

/**
 * Permanently delete a contact message (Admin only)
 */
exports.deleteContactMessage = async (req, res) => {
  const { id } = req.params;

  try {
    const message = await ContactMessage.findById(id);

    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }

    await message.remove();
    logger.info(`Contact message deleted: ${id}`);

    // Log the action
    await ActivityLog.create({
      action: 'delete',
      messageId: id,
      performedBy: req.user._id,
      details: `Permanently deleted message`,
    });

    res.status(200).json({ message: 'Contact message deleted successfully' });
  } catch (error) {
    logger.error(`Error deleting contact message: ${error.message}`);
    res.status(500).json({ message: 'Server error. Please try again later.' });
  }
};

/**
 * Export contact messages as CSV (Admin only)
 */
exports.exportMessages = async (req, res) => {
  try {
    const messages = await ContactMessage.find({ deleted: false })
      .populate('assignedTo', 'name email')
      .lean();

    const fields = [
      'name',
      'email',
      'message',
      'termsAgreed',
      'status',
      'assignedTo.name',
      'assignedTo.email',
      'createdAt',
      'updatedAt',
    ];
    const opts = { fields };
    const parser = new Parser(opts);
    const csv = parser.parse(messages);

    res.header('Content-Type', 'text/csv');
    res.attachment('contact_messages.csv');
    return res.send(csv);
  } catch (error) {
    logger.error(`Error exporting messages: ${error.message}`);
    res.status(500).json({ message: 'Server error. Please try again later.' });
  }
};

/**
 * Get activity logs (Admin only)
 */
exports.getActivityLogs = async (req, res) => {
  try {
    const logs = await ActivityLog.find()
      .populate('performedBy', 'name email')
      .populate('messageId', 'name email status')
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json(logs);
  } catch (error) {
    logger.error(`Error fetching activity logs: ${error.message}`);
    res.status(500).json({ message: 'Server error. Please try again later.' });
  }
};

/**
 * Get a single contact message details (Admin only)
 */
exports.getSingleContactMessage = async (req, res) => {
  const { id } = req.params;

  try {
    const message = await ContactMessage.findById(id)
      .populate('assignedTo', 'name email')
      .populate('responses.responder', 'name email')
      .lean();

    if (!message || message.deleted) {
      return res.status(404).json({ message: 'Message not found' });
    }

    res.status(200).json(message);
  } catch (error) {
    logger.error(`Error fetching single message: ${error.message}`);
    res.status(500).json({ message: 'Server error. Please try again later.' });
  }
};
