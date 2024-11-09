// controllers/categoryController.js

const Category = require('../models/Category');
const BlogPost = require('../models/BlogPost'); // Assuming you have a BlogPost model
const asyncHandler = require('express-async-handler');
const logger = require('../utils/logger'); // Ensure you have a logger utility
const ERROR_CODES = require('../constants/errorCodes'); // Define your error codes

// @desc    Create a new category
// @route   POST /api/categories
// @access  Private/Admin
exports.createCategory = asyncHandler(async (req, res, next) => {
  try {
    const { name, type, description, parent } = req.body; // type: 'product' or 'blog'

    // Check if category already exists
    const existingCategory = await Category.findOne({ name: name.trim() });
    if (existingCategory) {
      return res.status(400).json({
        success: false,
        message: 'Category with this name already exists',
      });
    }

    const category = new Category({ name, type, description, parent });
    await category.save();

    res.status(201).json({
      success: true,
      data: category,
      message: 'Category created successfully',
    });
  } catch (error) {
    logger.error('Create Category Error:', error);
    res.status(500).json({ success: false, message: ERROR_CODES.SERVER_ERROR || 'Server Error' });
  }
});

// @desc    Get all categories
// @route   GET /api/categories
// @access  Public
exports.getAllCategories = asyncHandler(async (req, res, next) => {
  try {
    const { type } = req.query; // Optional filter by type ('product' or 'blog')
    let query = {};

    if (type) {
      query.type = type;
    }

    const categories = await Category.find(query)
      .populate('subcategories', 'name slug type isActive') // Populate subcategories
      .sort({ name: 1 });

    res.status(200).json({
      success: true,
      count: categories.length,
      data: categories,
      message: 'Categories fetched successfully',
    });
  } catch (error) {
    logger.error('Get All Categories Error:', error);
    res.status(500).json({ success: false, message: ERROR_CODES.SERVER_ERROR || 'Server Error' });
  }
});

// @desc    Get category by ID
// @route   GET /api/categories/:id
// @access  Public
exports.getCategoryById = asyncHandler(async (req, res, next) => {
  try {
    const category = await Category.findById(req.params.id).populate('subcategories', 'name slug type isActive');

    if (!category) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }

    res.status(200).json({
      success: true,
      data: category,
      message: 'Category fetched successfully',
    });
  } catch (error) {
    logger.error('Get Category By ID Error:', error);
    res.status(500).json({ success: false, message: ERROR_CODES.SERVER_ERROR || 'Server Error' });
  }
});

// @desc    Update category details
// @route   PUT /api/categories/:id
// @access  Private/Admin
exports.updateCategory = asyncHandler(async (req, res, next) => {
  try {
    const updates = req.body;

    let category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }

    // If updating the name, check for duplicates
    if (updates.name && updates.name.trim() !== category.name) {
      const existingCategory = await Category.findOne({ name: updates.name.trim() });
      if (existingCategory) {
        return res.status(400).json({
          success: false,
          message: 'Another category with this name already exists',
        });
      }
      category.name = updates.name.trim();
    }

    // Update other fields
    if (updates.type) category.type = updates.type;
    if (updates.description !== undefined) category.description = updates.description;
    if (updates.parent !== undefined) category.parent = updates.parent;
    if (updates.isActive !== undefined) category.isActive = updates.isActive;

    await category.save();

    res.status(200).json({
      success: true,
      data: category,
      message: 'Category updated successfully',
    });
  } catch (error) {
    logger.error('Update Category Error:', error);
    res.status(500).json({ success: false, message: ERROR_CODES.SERVER_ERROR || 'Server Error' });
  }
});

// @desc    Delete a category
// @route   DELETE /api/categories/:id
// @access  Private/Admin
exports.deleteCategory = asyncHandler(async (req, res, next) => {
  try {
    let category = await Category.findById(req.params.id);

    if (!category) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }

    // Check if any blog posts are associated with this category
    const associatedPosts = await BlogPost.find({ categories: category._id });
    if (associatedPosts.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete category because it is associated with blog posts',
      });
    }

    // Optionally, check for subcategories and handle them accordingly
    const subcategories = await Category.find({ parent: category._id });
    if (subcategories.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete category because it has subcategories',
      });
    }

    await category.remove();

    res.status(200).json({
      success: true,
      message: 'Category deleted successfully',
    });
  } catch (error) {
    logger.error('Delete Category Error:', error);
    res.status(500).json({ success: false, message: ERROR_CODES.SERVER_ERROR || 'Server Error' });
  }
});
