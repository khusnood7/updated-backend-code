const FAQ = require('../models/FAQ');
const logger = require('../utils/logger');
const MESSAGES = require('../messages/en');
const ERROR_CODES = require('../constants/errorCodes');
const asyncHandler = require('express-async-handler');

// @desc    Create a new FAQ
// @route   POST /api/faqs
// @access  Private/Admin/Content Manager
exports.createFAQ = asyncHandler(async (req, res, next) => {
  const { question, answer } = req.body;

  const faq = await FAQ.create({
    question,
    answer,
  });

  res.status(201).json({
    success: true,
    data: faq,
    message: MESSAGES.FAQ.CREATE_SUCCESS,
  });
});

// @desc    Get all FAQs
// @route   GET /api/faqs
// @access  Public
exports.getAllFAQs = asyncHandler(async (req, res, next) => {
  const faqs = await FAQ.find();

  res.status(200).json({
    success: true,
    count: faqs.length,
    data: faqs,
    message: MESSAGES.FAQ.FETCH_SUCCESS,
  });
});

// @desc    Get a single FAQ by ID
// @route   GET /api/faqs/:id
// @access  Public
exports.getFAQById = asyncHandler(async (req, res, next) => {
  const faq = await FAQ.findById(req.params.id);

  if (!faq) {
    return res.status(404).json({ success: false, message: MESSAGES.FAQ.FAQ_NOT_FOUND });
  }

  res.status(200).json({
    success: true,
    data: faq,
    message: MESSAGES.FAQ.FETCH_SUCCESS,
  });
});

// @desc    Update an existing FAQ
// @route   PUT /api/faqs/:id
// @access  Private/Admin/Content Manager
exports.updateFAQ = asyncHandler(async (req, res, next) => {
  const { question, answer } = req.body;

  const faq = await FAQ.findById(req.params.id);

  if (!faq) {
    return res.status(404).json({ success: false, message: MESSAGES.FAQ.FAQ_NOT_FOUND });
  }

  if (question) faq.question = question;
  if (answer) faq.answer = answer;

  await faq.save();

  res.status(200).json({
    success: true,
    data: faq,
    message: MESSAGES.FAQ.UPDATE_SUCCESS,
  });
});

// @desc    Delete an FAQ
// @route   DELETE /api/faqs/:id
// @access  Private/Admin/Content Manager
exports.deleteFAQ = asyncHandler(async (req, res, next) => {
  const faq = await FAQ.findById(req.params.id);

  if (!faq) {
    return res.status(404).json({ success: false, message: MESSAGES.FAQ.FAQ_NOT_FOUND });
  }

  await faq.remove();

  res.status(200).json({
    success: true,
    message: MESSAGES.FAQ.DELETE_SUCCESS,
  });
});
