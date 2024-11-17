// controllers/reviewController.js

const Review = require('../models/Review');
const Product = require('../models/Product');
const logger = require('../utils/logger');
const MESSAGES = require('../messages/en');
const ERROR_CODES = require('../constants/errorCodes');
const cloudinary = require('../config/cloudinary');

/**
 * @desc    Create a new review
 * @route   POST /api/reviews
 * @access  Private/User
 */
exports.createReview = async (req, res, next) => {
  try {
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

    // Initialize reviewData
    const reviewData = {
      product,
      user: req.user._id,
      rating,
      comment,
    };

    // Handle photo uploads if provided
    if (req.files && req.files.length > 0) {
      const uploadedPhotos = [];

      for (const file of req.files) {
        try {
          const uploadResult = await new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
              { folder: 'review_photos' },
              (error, result) => {
                if (error) {
                  logger.error('Cloudinary Upload Error:', error);
                  return reject(error);
                }
                resolve(result);
              }
            );
            stream.end(file.buffer);
          });

          uploadedPhotos.push({
            url: uploadResult.secure_url,
            public_id: uploadResult.public_id,
          });
        } catch (uploadError) {
          logger.error('Photo Upload Failed:', uploadError);
          return res.status(500).json({ success: false, message: 'Failed to upload photos.' });
        }
      }

      reviewData.photos = uploadedPhotos;
    }

    // Create review
    const review = await Review.create(reviewData);

    res.status(201).json({
      success: true,
      data: review,
      message: MESSAGES.REVIEW.CREATE_SUCCESS,
    });
  } catch (error) {
    logger.error('Create Review Error:', error);
    res.status(500).json({ success: false, message: ERROR_CODES.SERVER_ERROR });
  }
};

/**
 * @desc    Get all reviews with optional filters
 * @route   GET /api/reviews
 * @access  Private/Admin/Product Manager
 */
exports.getAllReviews = async (req, res, next) => {
  try {
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
      .populate('product', 'title')
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
  } catch (error) {
    logger.error('Get All Reviews Error:', error);
    res.status(500).json({ success: false, message: ERROR_CODES.SERVER_ERROR });
  }
};

/**
 * @desc    Get a single review by ID
 * @route   GET /api/reviews/:id
 * @access  Private/Admin/Product Manager
 */
exports.getReviewById = async (req, res, next) => {
  try {
    const review = await Review.findById(req.params.id)
      .populate('product', 'title')
      .populate('user', 'name email');

    if (!review) {
      return res.status(404).json({ success: false, message: MESSAGES.REVIEW.REVIEW_NOT_FOUND });
    }

    res.status(200).json({
      success: true,
      data: review,
      message: MESSAGES.REVIEW.FETCH_SUCCESS,
    });
  } catch (error) {
    logger.error('Get Review By ID Error:', error);
    res.status(500).json({ success: false, message: ERROR_CODES.SERVER_ERROR });
  }
};

/**
 * @desc    Update a review (e.g., approve/reject)
 * @route   PUT /api/reviews/:id
 * @access  Private/Admin/Product Manager
 */
exports.updateReview = async (req, res, next) => {
  try {
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
  } catch (error) {
    logger.error('Update Review Error:', error);
    res.status(500).json({ success: false, message: ERROR_CODES.SERVER_ERROR });
  }
};

/**
 * @desc    Delete a review
 * @route   DELETE /api/reviews/:id
 * @access  Private/Admin/Product Manager
 */
exports.deleteReview = async (req, res, next) => {
  try {
    const review = await Review.findById(req.params.id);

    if (!review) {
      return res.status(404).json({ success: false, message: MESSAGES.REVIEW.REVIEW_NOT_FOUND });
    }

    // Optionally, delete associated photos from Cloudinary
    if (review.photos && review.photos.length > 0) {
      for (const photo of review.photos) {
        try {
          await cloudinary.uploader.destroy(photo.public_id);
        } catch (err) {
          logger.error(`Failed to delete photo ${photo.public_id} from Cloudinary:`, err);
        }
      }
    }

    await review.remove();

    res.status(200).json({
      success: true,
      message: MESSAGES.REVIEW.DELETE_SUCCESS,
    });
  } catch (error) {
    logger.error('Delete Review Error:', error);
    res.status(500).json({ success: false, message: ERROR_CODES.SERVER_ERROR });
  }
};
