// routes/contactRoutes.js

const express = require('express');
const { check } = require('express-validator');
const {
  submitContactMessage,
  getAllContactMessages,
  deleteContactMessage,
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
    check('termsAgreed', 'You must agree to the terms').isBoolean().custom(value => value === true),
  ],
  submitContactMessage
);

// Get all contact messages (Admin only)
router.get('/messages', authMiddleware, adminMiddleware, getAllContactMessages);

// Delete a contact message (Admin only)
router.delete('/messages/:id', authMiddleware, adminMiddleware, deleteContactMessage);

module.exports = router;
