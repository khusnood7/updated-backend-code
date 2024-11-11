// routes/orderRoutes.js

const express = require('express');
const router = express.Router();
const { body, param, query } = require('express-validator');
const orderController = require('../controllers/orderController');
const authMiddleware = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');
const validateMiddleware = require('../middleware/validateMiddleware');
const USER_ROLES = require('../constants/userRoles');

// Validation rules for creating an order
const createOrderValidation = [
  body('items')
    .isArray({ min: 1 })
    .withMessage('Items must be a non-empty array'),
  body('items.*.product')
    .isMongoId()
    .withMessage('Invalid product ID'),
  body('items.*.quantity')
    .isInt({ min: 1 })
    .withMessage('Quantity must be at least 1'),
  body('shippingAddress.street')
    .notEmpty()
    .withMessage('Street address is required'),
  body('shippingAddress.city')
    .notEmpty()
    .withMessage('City is required'),
  body('shippingAddress.state')
    .notEmpty()
    .withMessage('State is required'),
  body('shippingAddress.zip')
    .isLength({ min: 3, max: 10 })
    .withMessage('ZIP code must be between 3 and 10 characters')
    .matches(/^[A-Za-z0-9\s-]+$/)
    .withMessage('ZIP code can only contain letters, numbers, spaces, and hyphens'),
  body('shippingAddress.country')
    .notEmpty()
    .withMessage('Country is required'),
  body('billingAddress.street')
    .notEmpty()
    .withMessage('Billing street address is required'),
  body('billingAddress.city')
    .notEmpty()
    .withMessage('Billing city is required'),
  body('billingAddress.state')
    .notEmpty()
    .withMessage('Billing state is required'),
  body('billingAddress.zip')
    .isLength({ min: 3, max: 10 })
    .withMessage('Billing ZIP code must be between 3 and 10 characters')
    .matches(/^[A-Za-z0-9\s-]+$/)
    .withMessage('Billing ZIP code can only contain letters, numbers, spaces, and hyphens'),
  body('billingAddress.country')
    .notEmpty()
    .withMessage('Billing country is required'),
  body('paymentMethod')
    .isString()
    .withMessage('Payment method is required'),
  // Optional: Add couponCode validations if needed
];

// Routes

// Create a new order
router.post(
  '/',
  authMiddleware,
  createOrderValidation,
  validateMiddleware,
  orderController.createOrder
);

// Get all orders with filters (Admin)
router.get(
  '/',
  authMiddleware,
  adminMiddleware([
    USER_ROLES.SUPER_ADMIN,
    USER_ROLES.ORDER_MANAGER,
    USER_ROLES.ANALYTICS_VIEWER,
  ]),
  [
    query('status')
      .optional()
      .isIn([
        'pending',
        'processing',
        'shipped',
        'delivered',
        'cancelled',
        'refunded',
      ])
      .withMessage('Invalid status'),
    query('dateFrom')
      .optional()
      .isISO8601()
      .toDate()
      .withMessage('Invalid dateFrom'),
    query('dateTo')
      .optional()
      .isISO8601()
      .toDate()
      .withMessage('Invalid dateTo'),
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('page must be at least 1'),
    query('limit')
      .optional()
      .isInt({ min: 1 })
      .withMessage('limit must be at least 1'),
    validateMiddleware,
  ],
  orderController.getAllOrders
);


// Get authenticated user's orders
router.get(
  '/my-orders',
  authMiddleware,
  [
    query('status')
      .optional()
      .isIn(['pending', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'])
      .withMessage('Invalid status'),
    query('dateFrom')
      .optional()
      .isISO8601()
      .toDate()
      .withMessage('Invalid dateFrom'),
    query('dateTo')
      .optional()
      .isISO8601()
      .toDate()
      .withMessage('Invalid dateTo'),
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be at least 1'),
    query('limit')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Limit must be at least 1'),
    validateMiddleware,
  ],
  orderController.getMyOrders
);


// Get order by ID
router.get(
  '/:id',
  authMiddleware,
  [
    param('id')
      .isMongoId()
      .withMessage('Invalid order ID'),
    validateMiddleware,
  ],
  orderController.getOrderById
);

// Update order status (Admin)
router.put(
  '/:id/status',
  authMiddleware,
  adminMiddleware([
    USER_ROLES.SUPER_ADMIN,
    USER_ROLES.ORDER_MANAGER,
  ]),
  [
    param('id')
      .isMongoId()
      .withMessage('Invalid order ID'),
    body('status')
      .isIn([
        'pending',
        'processing',
        'shipped',
        'delivered',
        'cancelled',
        'refunded',
      ])
      .withMessage('Invalid order status'),
    validateMiddleware,
  ],
  orderController.updateOrderStatus
);




// Cancel an order (Admin)
router.post(
  '/:id/cancel',
  authMiddleware,
  adminMiddleware([
    USER_ROLES.SUPER_ADMIN,
    USER_ROLES.ORDER_MANAGER,
  ]),
  [
    param('id')
      .isMongoId()
      .withMessage('Invalid order ID'),
    body('reason')
      .optional()
      .isString()
      .withMessage('Reason must be a string'),
    validateMiddleware,
  ],
  orderController.cancelOrder
);

module.exports = router;
