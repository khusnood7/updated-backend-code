// Importing the required modules and middlewares
const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const userController = require('../controllers/userController');
const authMiddleware = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');
const validateMiddleware = require('../middleware/validateMiddleware');
const USER_ROLES = require('../constants/userRoles');
const uploadMiddlewares = require('../middleware/uploadMiddleware'); // Import Multer middleware array
const {
  getAddresses,
  addAddress,
  updateAddress,
  deleteAddress,
} = require('../controllers/addressController');

// ============================
// Validation Rules
// ============================

// Validation rules for creating a new user
const createUserValidation = [
  body('name')
    .isString()
    .isLength({ min: 3 })
    .withMessage('Name must be at least 3 characters long'),
  body('email')
    .isEmail()
    .withMessage('Please provide a valid email'),
  body('password')
    .isStrongPassword()
    .withMessage('Password must contain at least 8 characters, including one uppercase letter, one number, and one special character'),
  body('role')
    .optional()
    .isIn(Object.values(USER_ROLES))
    .withMessage('Invalid user role'),
];

// Validation rules for updating an existing user
const updateUserValidation = [
  body('name')
    .optional()
    .isString()
    .isLength({ min: 3 })
    .withMessage('Name must be at least 3 characters long'),
  body('email')
    .optional()
    .isEmail()
    .withMessage('Please provide a valid email'),
  body('role')
    .optional()
    .isIn(Object.values(USER_ROLES))
    .withMessage('Invalid user role'),
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be a boolean'),
];

// Validation rules for resetting user password
const resetPasswordValidation = [
  body('password')
    .isStrongPassword()
    .withMessage('Password must contain at least 8 characters, including one uppercase letter, one number, and one special character'),
];

// ============================
// Routes
// ============================

// Create a New User
router.post(
  '/admin/users',
  authMiddleware,
  adminMiddleware([USER_ROLES.SUPER_ADMIN, USER_ROLES.MARKETING_MANAGER]),
  ...uploadMiddlewares, // Spread the array to apply both upload and error handling middleware
  createUserValidation,
  validateMiddleware,
  userController.createUser
);

// Get all users (Admin)
router.get(
  '/admin/users',
  authMiddleware,
  adminMiddleware([USER_ROLES.SUPER_ADMIN, USER_ROLES.MARKETING_MANAGER]),
  validateMiddleware,
  userController.getAllUsers
);

// Get user by ID (Admin)
router.get(
  '/admin/users/:id',
  authMiddleware,
  adminMiddleware([USER_ROLES.SUPER_ADMIN, USER_ROLES.MARKETING_MANAGER]),
  param('id').isMongoId().withMessage('Invalid user ID'),
  validateMiddleware,
  userController.getUserById
);

// Update user by ID (Admin/Super Admin/Marketing Manager)
router.put(
  '/admin/users/:id',
  authMiddleware,
  adminMiddleware([USER_ROLES.SUPER_ADMIN, USER_ROLES.MARKETING_MANAGER]),
  ...uploadMiddlewares,  // Spread the array to apply both upload and error handling middleware
  [
    param('id').isMongoId().withMessage('Invalid user ID'),
    ...updateUserValidation,
  ],
  validateMiddleware,
  userController.updateUser
);

// Delete or deactivate user (Admin)
router.delete(
  '/admin/users/:id',
  authMiddleware,
  adminMiddleware([USER_ROLES.SUPER_ADMIN]),
  param('id').isMongoId().withMessage('Invalid user ID'),
  validateMiddleware,
  userController.deleteUser
);

// Admin-initiated password reset
router.post(
  '/admin/users/:id/reset-password',
  authMiddleware,
  adminMiddleware([USER_ROLES.SUPER_ADMIN]),
  param('id').isMongoId().withMessage('Invalid user ID'),
  resetPasswordValidation,
  validateMiddleware,
  userController.resetUserPassword
);

// ============================
// Address Routes Integration
// ============================

// Route: /api/users/addresses
router.route('/addresses').get(authMiddleware, getAddresses).post(authMiddleware, addAddress);

// Route: /api/users/addresses/:id
router.route('/addresses/:id').put(authMiddleware, updateAddress).delete(authMiddleware, deleteAddress);

module.exports = router;
