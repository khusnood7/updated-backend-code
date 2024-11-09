// controllers/reviewController.js
const Review = require('../models/Review');
const Product = require('../models/Product');
const logger = require('../utils/logger');
const MESSAGES = require('../messages/en');
const ERROR_CODES = require('../constants/errorCodes');
const asyncHandler = require('express-async-handler');

// @desc    Create a new review
// @route   POST /api/reviews
// @access  Private/User
exports.createReview = asyncHandler(async (req, res, next) => {
  const { product, rating, comment } = req.body;

  // Check if product exists and is active
  const existingProduct = await Product.findById(product);
  if (!existingProduct || !existingProduct.isActive) {
    return res.status(400).json({ success: false, message: 'Invalid or inactive product.' });
  }

  // Check if user has already reviewed this product
  const existingReview = await Review.findOne({ product, user: req.user._id });
  if (existingReview) {
    return res.status(400).json({ success: false, message: 'You have already reviewed this product.' });
  }

  const review = await Review.create({
    product,
    user: req.user._id,
    rating,
    comment,
  });

  res.status(201).json({
    success: true,
    data: review,
    message: MESSAGES.REVIEW.CREATE_SUCCESS,
  });
});

// @desc    Get all reviews with optional filters
// @route   GET /api/reviews
// @access  Private/Admin/Product Manager
exports.getAllReviews = asyncHandler(async (req, res, next) => {
  const { product, isApproved, page = 1, limit = 10 } = req.query;
  let filter = {};

  if (product) {
    filter.product = product;
  }

  if (isApproved !== undefined) {
    filter.isApproved = isApproved === 'true';
  }

  const skip = (page - 1) * limit;

  const reviews = await Review.find(filter)
    .populate('product', 'name')
    .populate('user', 'name email')
    .sort({ createdAt: -1 })
    .skip(parseInt(skip))
    .limit(parseInt(limit));

  const total = await Review.countDocuments(filter);

  res.status(200).json({
    success: true,
    count: reviews.length,
    total,
    data: reviews,
    message: MESSAGES.REVIEW.FETCH_SUCCESS,
  });
});

// @desc    Get a single review by ID
// @route   GET /api/reviews/:id
// @access  Private/Admin/Product Manager
exports.getReviewById = asyncHandler(async (req, res, next) => {
  const review = await Review.findById(req.params.id)
    .populate('product', 'name')
    .populate('user', 'name email');

  if (!review) {
    return res.status(404).json({ success: false, message: MESSAGES.REVIEW.REVIEW_NOT_FOUND });
  }

  res.status(200).json({
    success: true,
    data: review,
    message: MESSAGES.REVIEW.FETCH_SUCCESS,
  });
});

// @desc    Update a review (e.g., approve or reject)
// @route   PUT /api/reviews/:id
// @access  Private/Admin/Product Manager
exports.updateReview = asyncHandler(async (req, res, next) => {
  const { isApproved, comment } = req.body;

  const review = await Review.findById(req.params.id);

  if (!review) {
    return res.status(404).json({ success: false, message: MESSAGES.REVIEW.REVIEW_NOT_FOUND });
  }

  if (isApproved !== undefined) {
    review.isApproved = isApproved;
  }

  if (comment) {
    review.comment = comment;
  }

  await review.save();

  res.status(200).json({
    success: true,
    data: review,
    message: MESSAGES.REVIEW.UPDATE_SUCCESS,
  });
});

// @desc    Delete a review
// @route   DELETE /api/reviews/:id
// @access  Private/Admin/Product Manager
exports.deleteReview = asyncHandler(async (req, res, next) => {
  const review = await Review.findById(req.params.id);

  if (!review) {
    return res.status(404).json({ success: false, message: MESSAGES.REVIEW.REVIEW_NOT_FOUND });
  }

  await review.remove();

  res.status(200).json({
    success: true,
    message: MESSAGES.REVIEW.DELETE_SUCCESS,
  });
});
