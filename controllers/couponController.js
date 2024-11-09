// controllers/couponController.js
const Coupon = require('../models/Coupon');
const logger = require('../utils/logger');
const ERROR_CODES = require('../constants/errorCodes');

// @desc    Create a new coupon
// @route   POST /api/coupons
// @access  Private/Admin/Marketing Manager
exports.createCoupon = async (req, res) => {
  try {
    const { code, discount, discountType, expirationDate, maxUses } = req.body;

    const existingCoupon = await Coupon.findOne({ code });
    if (existingCoupon) {
      return res.status(400).json({ success: false, message: 'Coupon code already exists' });
    }

    const coupon = new Coupon({
      code,
      discount,
      discountType, // 'percentage' or 'fixed'
      expirationDate,
      maxUses,
    });

    await coupon.save();

    res.status(201).json({
      success: true,
      data: coupon,
    });
  } catch (error) {
    logger.error('Create Coupon Error:', error);
    res.status(500).json({ success: false, message: ERROR_CODES.SERVER_ERROR });
  }
};

// @desc    Get all coupons
// @route   GET /api/coupons
// @access  Public/Admin/Marketing Manager
exports.getAllCoupons = async (req, res) => {
  try {
    const { expired, active } = req.query;
    let query = {};

    if (expired !== undefined) {
      query.expirationDate = expired === 'true' ? { $lt: new Date() } : { $gte: new Date() };
    }

    if (active !== undefined) {
      query.isActive = active === 'true';
    }

    const coupons = await Coupon.find(query);

    res.status(200).json({
      success: true,
      count: coupons.length,
      data: coupons,
    });
  } catch (error) {
    logger.error('Get All Coupons Error:', error);
    res.status(500).json({ success: false, message: ERROR_CODES.SERVER_ERROR });
  }
};

// @desc    Get a specific coupon by ID
// @route   GET /api/coupons/:id
// @access  Public/Admin/Marketing Manager
exports.getCouponById = async (req, res) => {
  try {
    const couponId = req.params.id;
    const coupon = await Coupon.findById(couponId);

    if (coupon) {
      res.status(200).json({
        success: true,
        data: coupon
      });
    } else {
      res.status(404).json({
        success: false,
        message: 'Coupon not found'
      });
    }
  } catch (error) {
    logger.error('Get Coupon By ID Error:', error);
    res.status(500).json({ success: false, message: ERROR_CODES.SERVER_ERROR });
  }
};

// @desc    Update a coupon by ID
// @route   PUT /api/coupons/:id
// @access  Private/Admin/Marketing Manager
exports.updateCoupon = async (req, res) => {
  try {
    const updates = req.body;
    const couponId = req.params.id;

    const coupon = await Coupon.findById(couponId);

    if (!coupon) {
      return res.status(404).json({ success: false, message: 'Coupon not found' });
    }

    Object.keys(updates).forEach((key) => {
      coupon[key] = updates[key];
    });

    await coupon.save();

    res.status(200).json({
      success: true,
      data: coupon,
    });
  } catch (error) {
    logger.error('Update Coupon Error:', error);
    res.status(500).json({ success: false, message: ERROR_CODES.SERVER_ERROR });
  }
};

// @desc    Delete or deactivate a coupon by ID
// @route   DELETE /api/coupons/:id
// @access  Private/Admin/Marketing Manager
exports.deleteCoupon = async (req, res) => {
  try {
    const couponId = req.params.id;

    const coupon = await Coupon.findById(couponId);

    if (!coupon) {
      return res.status(404).json({ success: false, message: 'Coupon not found' });
    }

    coupon.isActive = false; // Soft delete
    await coupon.save();

    res.status(200).json({
      success: true,
      message: 'Coupon deactivated successfully',
    });
  } catch (error) {
    logger.error('Delete Coupon Error:', error);
    res.status(500).json({ success: false, message: ERROR_CODES.SERVER_ERROR });
  }
};
