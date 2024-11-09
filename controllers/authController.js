// controllers/authController.js

const fs = require("fs");
const path = require("path"); // Ensure this is present
const User = require("../models/User");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const handlebars = require("handlebars"); // Ensure this is present
const crypto = require("crypto");
const sendEmail = require("../utils/sendEmail");
const logger = require("../utils/logger");
const ERROR_CODES = require("../constants/errorCodes");
const cloudinary = require("../config/cloudinary"); // Import Cloudinary configuration

const { compileTemplate } = require("../services/templateService");

// @desc    Register a new user
// @route   POST /api/auth/register
// @access  Public
exports.register = async (req, res, next) => {
  try {
    const { name, email, password, role, adminSecretKey } = req.body;

    // Check if user exists
    let user = await User.findOne({ email });
    if (user) {
      return res
        .status(400)
        .json({ success: false, message: "User already exists" });
    }

    // Check if the role is an elevated one and validate the admin secret key
    if (role && role !== "user") {
      const adminKeys = {
        "super-admin": process.env.SUPER_ADMIN,
        "product-manager": process.env.PRODUCT_MANAGER,
        "order-manager": process.env.ORDER_MANAGER,
        "content-manager": process.env.CONTENT_MANAGER,
        "customer-support-manager": process.env.CUSTOMER_SUPPORT_MANAGER,
        "marketing-manager": process.env.MARKETING_MANAGER,
        "finance-manager": process.env.FINANCE_MANAGER,
        "sales-manager": process.env.SALES_MANAGER,
      };

      // Validate the provided admin secret key
      if (!adminSecretKey || adminSecretKey !== adminKeys[role]) {
        logger.warn(`Invalid or missing admin secret key for role '${role}'`);
        return res
          .status(403)
          .json({ success: false, message: "Invalid admin secret key" });
      }
    }

    // Create user
    user = new User({
      name,
      email,
      password,
      role: role || "user", // Default role set to 'user'
    });

    // Hash password
    const salt = await bcrypt.genSalt(12);
    user.password = await bcrypt.hash(password, salt);

    // Handle profile picture upload if provided
    if (req.file) {
      try {
        const uploadResult = await new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            { folder: "user_profiles" },
            (error, result) => {
              if (error) return reject(error);
              resolve(result);
            }
          );
          stream.end(req.file.buffer);
        });

        // Set profile picture URL
        user.profilePicture = uploadResult.secure_url;
      } catch (uploadError) {
        logger.error("Profile Picture Upload Error:", uploadError);
        return res.status(500).json({
          success: false,
          message: "Failed to upload profile picture",
        });
      }
    }

    await user.save();

    // Generate JWT
    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      {
        expiresIn: "1h",
      }
    );

    res.status(201).json({
      success: true,
      token,
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        profilePicture: user.profilePicture,
        isActive: user.isActive,
      }, // Exclude password
    });
  } catch (error) {
    logger.error("Register Error:", error);
    res.status(500).json({ success: false, message: ERROR_CODES.SERVER_ERROR });
  }
};

// @desc    Update user profile
// @route   PUT /api/auth/update-profile
// @access  Private
exports.updateProfile = async (req, res, next) => {
  try {
    const { name, email } = req.body;

    // Fetch the user by ID from the token
    const user = await User.findById(req.user.id);

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    // If email is being updated, check if it's already in use
    if (email && email !== user.email) {
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res
          .status(400)
          .json({ success: false, message: "Email already in use" });
      }
      user.email = email;
    }

    // Update name if provided
    if (name) {
      user.name = name;
    }

    // Handle profile picture upload if a file is provided
    if (req.file) {
      try {
        const uploadResult = await new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            { folder: "user_profiles" },
            (error, result) => {
              if (error) return reject(error);
              resolve(result);
            }
          );
          stream.end(req.file.buffer);
        });

        // Update user's profile picture URL
        user.profilePicture = uploadResult.secure_url;
      } catch (uploadError) {
        logger.error("Profile Picture Upload Error:", uploadError);
        return res.status(500).json({
          success: false,
          message: "Failed to upload profile picture",
        });
      }
    }

    await user.save();

    res.status(200).json({
      success: true,
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        profilePicture: user.profilePicture,
        isActive: user.isActive,
      }, // Exclude password
    });
  } catch (error) {
    logger.error("Update Profile Error:", error);
    res.status(500).json({ success: false, message: ERROR_CODES.SERVER_ERROR });
  }
};

// @desc    Login user/admin
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Validate email & password
    if (!email || !password) {
      return res
        .status(400)
        .json({ success: false, message: "Please provide email and password" });
    }

    // Check for user
    const user = await User.findOne({ email }).select("+password");
    if (!user) {
      return res
        .status(401)
        .json({ success: false, message: ERROR_CODES.AUTHENTICATION_FAILED });
    }

    // Check if password matches
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res
        .status(401)
        .json({ success: false, message: ERROR_CODES.AUTHENTICATION_FAILED });
    }

    // Generate JWT
    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      {
        expiresIn: "1h",
      }
    );

    res.status(200).json({
      success: true,
      token,
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        profilePicture: user.profilePicture,
        isActive: user.isActive,
      }, // Exclude password
    });
  } catch (error) {
    logger.error("Login Error:", error);
    res.status(500).json({ success: false, message: ERROR_CODES.SERVER_ERROR });
  }
};

// @desc    Get current logged-in user
// @route   GET /api/auth/me
// @access  Private
exports.getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    logger.error("Get Me Error:", error);
    res.status(500).json({ success: false, message: ERROR_CODES.SERVER_ERROR });
  }
};

// @desc    Forgot Password
// @route   POST /api/auth/forgot-password
// @access  Public
exports.forgotPassword = async (req, res, next) => {
  try {
    // Logging for debugging
    logger.info("Initiating forgotPassword process");
    logger.info(`Request body: ${JSON.stringify(req.body)}`);

    // Find the user by email
    const user = await User.findOne({ email: req.body.email });
    if (!user) {
      logger.warn(`No user found with email: ${req.body.email}`);
      return res
        .status(404)
        .json({ success: false, message: "There is no user with that email" });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(20).toString("hex");
    logger.info(`Generated reset token: ${resetToken}`);

    // Hash token and set to resetPasswordToken field
    user.resetPasswordToken = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");
    logger.info(`Hashed reset token: ${user.resetPasswordToken}`);

    // Set token expiration time
    user.resetPasswordExpire = Date.now() + 10 * 60 * 1000; // 10 minutes

    await user.save({ validateBeforeSave: false });
    logger.info(`Saved reset token and expiration for user: ${user.email}`);

    // Create reset URL pointing to the frontend
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;
    logger.info(`Reset URL: ${resetUrl}`);

    // Load and compile the HTML template
    const templatePath = path.join(
      __dirname,
      "../templates/passwordReset.html"
    );
    logger.info(`Template path: ${templatePath}`);
    const templateSource = fs.readFileSync(templatePath, "utf8");
    const template = handlebars.compile(templateSource);

    const htmlContent = template({
      name: user.name,
      resetUrl,
    });

    // Define plain text message as a fallback
    const plainTextMessage = `You are receiving this email because you (or someone else) has requested the reset of a password.\n\nPlease use the following link to reset your password:\n\n${resetUrl}\n\nIf you did not request this, please ignore this email and your password will remain unchanged.`;

    try {
      await sendEmail({
        email: user.email,
        subject: "Password Reset Request",
        message: plainTextMessage,
        html: htmlContent, // Send the HTML content
      });

      logger.info(`Password reset email sent to: ${user.email}`);
      res.status(200).json({ success: true, data: "Email sent" });
    } catch (err) {
      // Reset the reset token and expiration
      user.resetPasswordToken = undefined;
      user.resetPasswordExpire = undefined;

      await user.save({ validateBeforeSave: false });
      logger.error("Forgot Password Email Error:", err);
      return res
        .status(500)
        .json({ success: false, message: "Email could not be sent" });
    }
  } catch (error) {
    logger.error("Forgot Password Error:", error);
    res.status(500).json({ success: false, message: ERROR_CODES.SERVER_ERROR });
  }
};

// @desc    Reset Password
// @route   POST /api/auth/reset-password/:resetToken
// @access  Public
exports.resetPassword = async (req, res, next) => {
  try {
    // Get hashed token
    const resetPasswordToken = crypto
      .createHash("sha256")
      .update(req.params.resetToken)
      .digest("hex");

    // Find user by token and ensure token is not expired
    const user = await User.findOne({
      resetPasswordToken,
      resetPasswordExpire: { $gt: Date.now() },
    });

    if (!user) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid or expired token" });
    }

    // Hash the new password before saving
    const salt = await bcrypt.genSalt(12);
    user.password = await bcrypt.hash(req.body.password, salt);

    // Clear reset token fields
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;

    await user.save();

    // Generate JWT for the user
    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      {
        expiresIn: "1h",
      }
    );

    res.status(200).json({
      success: true,
      token,
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        profilePicture: user.profilePicture,
        isActive: user.isActive,
      }, // Exclude password
    });
  } catch (error) {
    logger.error("Reset Password Error:", error);
    res.status(500).json({ success: false, message: ERROR_CODES.SERVER_ERROR });
  }
};

// @desc    Logout User
// @route   POST /api/auth/logout
// @access  Private
exports.logout = async (req, res, next) => {
  try {
    // If using token blacklist, add token to blacklist here
    // Example: await blacklistToken(req.token);

    res.status(200).json({ success: true, message: "Logged out successfully" });
  } catch (error) {
    logger.error("Logout Error:", error);
    res.status(500).json({ success: false, message: ERROR_CODES.SERVER_ERROR });
  }
};
