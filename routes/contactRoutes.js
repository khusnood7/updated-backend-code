// routes/contactRoutes.js

const express = require('express');
const { check } = require('express-validator');
const {
  submitContactMessage,
  getAllContactMessages,
  deleteContactMessage,
  updateMessageStatus,
  assignAdminToMessage,
  respondToMessage,
  softDeleteContactMessage,
  restoreContactMessage,
  exportMessages,
  getActivityLogs,
  getSingleContactMessage,
} = require('../controllers/ContactController');

// Import middleware
const authMiddleware = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');

const router = express.Router();

// Submit contact message (Public)
router.post(
  '/',
  [
    check('name', 'Name is required').notEmpty(),
    check('email', 'Please include a valid email').isEmail(),
    check('message', 'Message is required').notEmpty(),
    check('termsAgreed', 'You must agree to the terms').isBoolean().custom((value) => value === true),
  ],
  submitContactMessage
);

// Get all contact messages (Admin only) with pagination, search, and filters
router.get('/', authMiddleware, adminMiddleware, getAllContactMessages);

// Export messages as CSV (Admin only)
router.get('/export', authMiddleware, adminMiddleware, exportMessages);

// Get activity logs (Admin only)
router.get('/activity-logs', authMiddleware, adminMiddleware, getActivityLogs);

// View a single message details (Admin only)
router.get('/:id', authMiddleware, adminMiddleware, getSingleContactMessage);

// Update message status (Admin only)
router.patch('/:id/status', authMiddleware, adminMiddleware, [
  check('status', 'Status is required and must be one of new, in-progress, resolved')
    .notEmpty()
    .isIn(['new', 'in-progress', 'resolved']),
], updateMessageStatus);

// Assign admin to message (Admin only)
router.patch('/:id/assign', authMiddleware, adminMiddleware, [
  check('adminId', 'adminId is required and must be a valid user ID').notEmpty().isMongoId(),
], assignAdminToMessage);

// Respond to message (Admin only)
router.post('/:id/respond', authMiddleware, adminMiddleware, [
  check('responseMessage', 'Response message is required and must be at least 10 characters long')
    .notEmpty()
    .isLength({ min: 10 }),
], respondToMessage);

// Soft delete a contact message (Admin only)
router.patch('/:id/soft-delete', authMiddleware, adminMiddleware, softDeleteContactMessage);

// Restore a soft-deleted message (Admin only)
router.patch('/:id/restore', authMiddleware, adminMiddleware, restoreContactMessage);

// Permanently delete a contact message (Admin only)
router.delete('/:id', authMiddleware, adminMiddleware, deleteContactMessage);

module.exports = router;
