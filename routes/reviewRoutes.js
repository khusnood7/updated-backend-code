// routes/reviewRoutes.js
const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const reviewController = require('../controllers/reviewController');
const authMiddleware = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');
const validateMiddleware = require('../middleware/validateMiddleware');
const USER_ROLES = require('../constants/userRoles');

// Validation rules
const createReviewValidation = [
  body('product').isMongoId().withMessage('Invalid product ID'),
  body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
  body('comment').optional().isString().isLength({ max: 1000 }).withMessage('Comment too long'),
];

const approveReviewValidation = [
  body('isApproved').isBoolean().withMessage('isApproved must be a boolean'),
];

// Routes

// Create a new review
router.post(
  '/',
  authMiddleware,
  createReviewValidation,
  validateMiddleware,
  reviewController.createReview
);

// Get all reviews (Admin)
router.get(
  '/',
  authMiddleware,
  adminMiddleware([USER_ROLES.SUPER_ADMIN, USER_ROLES.PRODUCT_MANAGER]),
  reviewController.getAllReviews
);

// Get review by ID
router.get(
  '/:id',
  [param('id').isMongoId().withMessage('Invalid review ID'), validateMiddleware],
  reviewController.getReviewById
);

// Update review (e.g., approve/reject)
router.put(
  '/:id',
  authMiddleware,
  adminMiddleware([USER_ROLES.SUPER_ADMIN, USER_ROLES.PRODUCT_MANAGER]),
  [param('id').isMongoId().withMessage('Invalid review ID'), approveReviewValidation, validateMiddleware],
  reviewController.updateReview
);

// Delete review
router.delete(
  '/:id',
  authMiddleware,
  adminMiddleware([USER_ROLES.SUPER_ADMIN, USER_ROLES.PRODUCT_MANAGER]),
  [param('id').isMongoId().withMessage('Invalid review ID'), validateMiddleware],
  reviewController.deleteReview
);

module.exports = router;
