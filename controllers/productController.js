// controllers/productController.js

const Product = require('../models/Product');
const cloudinary = require('../config/cloudinary');
const logger = require('../utils/logger');
const ERROR_CODES = require('../constants/errorCodes');

// @desc    Create a new product
// @route   POST /api/products
// @access  Private/Admin/Product Manager
exports.createProduct = async (req, res) => {
  try {
    const { title, price, stock, description, category, tags, discountPercentage, brand, accordion } = req.body;

    const product = new Product({
      title,
      price,
      stock,
      description,
      category,
      tags,
      discountPercentage,
      brand,
      accordion,
      images: [],
    });

    await product.save();

    res.status(201).json({
      success: true,
      data: product,
    });
  } catch (error) {
    logger.error('Create Product Error:', error);
    res.status(500).json({ success: false, message: ERROR_CODES.SERVER_ERROR });
  }
};

// @desc    Get a single product by ID
// @route   GET /api/products/:id
// @access  Public/Admin
exports.getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate('tags'); // Populating 'tags' as it's now defined in the schema

    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    res.status(200).json({
      success: true,
      data: product,
    });
  } catch (error) {
    logger.error('Get Product By ID Error:', error);
    res.status(500).json({ success: false, message: ERROR_CODES.SERVER_ERROR });
  }
};

// @desc    Get a single product by Slug
// @route   GET /api/products/slug/:slug
// @access  Public
exports.getProductBySlug = async (req, res) => {
  try {
    const product = await Product.findOne({ slug: req.params.slug })
      .populate('tags'); // Populating 'tags'

    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    res.status(200).json({
      success: true,
      data: product,
    });
  } catch (error) {
    logger.error('Get Product By Slug Error:', error);
    res.status(500).json({ success: false, message: ERROR_CODES.SERVER_ERROR });
  }
};


// @desc    Search products by query
// @route   GET /api/products/search
// @access  Public
exports.searchProducts = async (req, res) => {
  try {
    const { query } = req.query;

    if (!query) {
      return res.status(400).json({ success: false, message: 'Search query is required.' });
    }

    // Perform case-insensitive search on product titles
    const regex = new RegExp(query, 'i');

    const products = await Product.find({ title: regex, isActive: true }).limit(10).populate('tags');

    res.status(200).json({
      success: true,
      products,
    });
  } catch (error) {
    logger.error('Search Products Error:', error);
    res.status(500).json({ success: false, message: ERROR_CODES.SERVER_ERROR });
  }
};




// @desc    Get all products with filters and pagination
// @route   GET /api/products
// @access  Public/Admin
exports.getAllProducts = async (req, res) => {
  try {
    const { category, tags, priceMin, priceMax, inStock, variants, packaging, page = 1, limit = 6 } = req.query; // Set default limit to 6

    let query = {};

    // Filter by category if provided and not 'All'
    if (category && category !== 'All') {
      query.category = category;
    }

    // Filter by tags if provided
    if (tags) {
      const tagsArray = tags.split(',').map(tag => tag.trim());
      query.tags = { $in: tagsArray };
    }

    // Filter by variants if provided
    if (variants) {
      const variantsArray = variants.split(',').map(v => v.trim());
      query['variants.size'] = { $in: variantsArray };
    }

    // Filter by packaging if provided and not 'All'
    if (packaging && packaging !== 'All') {
      query.packaging = packaging;
    }

    // Filter by price range if provided
    if (priceMin || priceMax) {
      query.price = {};
      if (priceMin) query.price.$gte = Number(priceMin);
      if (priceMax) query.price.$lte = Number(priceMax);
    }

    // Filter by stock status if provided
    if (inStock !== undefined) {
      query.stock = inStock === 'true' ? { $gt: 0 } : { $eq: 0 };
    }

    // Pagination calculations
    const total = await Product.countDocuments(query);
    const totalPages = Math.ceil(total / limit);
    const products = await Product.find(query)
      .skip((page - 1) * limit)
      .limit(Number(limit));

    res.status(200).json({
      success: true,
      total, // Total number of matching products
      count: products.length,
      totalPages,
      currentPage: Number(page),
      products, // Changed from 'data' to 'products' for consistency
    });
  } catch (error) {
    logger.error('Get All Products Error:', error);
    res.status(500).json({ success: false, message: ERROR_CODES.SERVER_ERROR });
  }
};


// @desc    Get a single product by ID
// @route   GET /api/products/:id
// @access  Public/Admin
exports.getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).populate('category').populate('tags');

    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    res.status(200).json({
      success: true,
      data: product,
    });
  } catch (error) {
    logger.error('Get Product By ID Error:', error);
    res.status(500).json({ success: false, message: ERROR_CODES.SERVER_ERROR });
  }
};

// @desc    Update a product by ID
// @route   PUT /api/products/:id
// @access  Private/Admin/Product Manager
exports.updateProduct = async (req, res) => {
  try {
    const updates = req.body;

    let product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    // Update each field if provided
    Object.keys(updates).forEach((key) => {
      if (key === 'accordion' && typeof updates[key] === 'object') {
        product.accordion = { ...product.accordion, ...updates[key] };
      } else {
        product[key] = updates[key];
      }
    });

    await product.save();

    res.status(200).json({
      success: true,
      data: product,
    });
  } catch (error) {
    logger.error('Update Product Error:', error);
    res.status(500).json({ success: false, message: ERROR_CODES.SERVER_ERROR });
  }
};

// @desc    Delete (deactivate) a product by ID
// @route   DELETE /api/products/:id
// @access  Private/Admin/Product Manager
exports.deleteProduct = async (req, res) => {
  try {
    let product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    product.isActive = false; // Soft delete
    await product.save();

    res.status(200).json({
      success: true,
      message: 'Product deactivated successfully',
    });
  } catch (error) {
    logger.error('Delete Product Error:', error);
    res.status(500).json({ success: false, message: ERROR_CODES.SERVER_ERROR });
  }
};

// @desc    Update product stock level
// @route   PUT /api/products/:id/stock
// @access  Private/Admin/Product Manager
exports.updateProductStock = async (req, res) => {
  try {
    const { stock } = req.body;

    let product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    product.stock = stock;
    await product.save();

    res.status(200).json({
      success: true,
      data: product,
    });
  } catch (error) {
    logger.error('Update Product Stock Error:', error);
    res.status(500).json({ success: false, message: ERROR_CODES.SERVER_ERROR });
  }
};

// @desc    Bulk update products
// @route   POST /api/products/bulk-update
// @access  Private/Admin/Product Manager
exports.bulkUpdateProducts = async (req, res) => {
  try {
    const { updates } = req.body; // Array of { id, fields to update }

    const bulkOps = updates.map((update) => {
      const updateFields = { ...update.fields };
      if (updateFields.accordion && typeof updateFields.accordion === 'object') {
        // Merge existing accordion data with new data
        updateFields.accordion = { ...updateFields.accordion };
      }
      return {
        updateOne: {
          filter: { _id: update.id },
          update: { $set: updateFields },
        },
      };
    });

    await Product.bulkWrite(bulkOps);

    res.status(200).json({
      success: true,
      message: 'Products updated successfully',
    });
  } catch (error) {
    logger.error('Bulk Update Products Error:', error);
    res.status(500).json({ success: false, message: ERROR_CODES.SERVER_ERROR });
  }
};

// @desc    Upload product image
// @route   POST /api/products/upload-image
// @access  Private/Admin/Product Manager
exports.uploadProductImage = async (req, res) => {
  try {
    if (!req.files || !req.files.image) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const file = req.files.image;

    // Upload to Cloudinary
    const result = await cloudinary.uploader.upload(file.tempFilePath, {
      folder: 'products',
      width: 800,
      height: 800,
      crop: 'fill',
    });

    res.status(200).json({
      success: true,
      data: result.secure_url,
    });
  } catch (error) {
    logger.error('Upload Product Image Error:', error);
    res.status(500).json({ success: false, message: ERROR_CODES.SERVER_ERROR });
  }
};
