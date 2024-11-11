// controllers/orderController.js

const Order = require('../models/Order');
const Product = require('../models/Product');
const Coupon = require('../models/Coupon');
const Transaction = require('../models/Transaction');
const logger = require('../utils/logger');
const MESSAGES = require('../messages/en'); // Ensure this path is correct
const ERROR_CODES = require('../constants/errorCodes');
const asyncHandler = require('express-async-handler');
const { processPayment } = require('../services/paymentService');
const { setCache, getCache, deleteCache } = require('../services/redisService');
const crypto = require('crypto');

// Encryption key for sensitive data
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'defaultEncryptionKey123456'; // Replace with a secure key in production
const IV_LENGTH = 16;

// Helper function to encrypt sensitive fields
const encrypt = (text) => {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
};

/**
 * @desc    Create a new order
 * @route   POST /api/orders
 * @access  Private/Customer
 */
exports.createOrder = asyncHandler(async (req, res, next) => {
  const { items, shippingAddress, billingAddress, paymentMethod, couponCode } = req.body;

  if (!items || items.length === 0) {
    return res.status(400).json({ success: false, message: 'No items provided for the order.' });
  }

  let totalAmount = 0;
  const populatedItems = [];

  // Validate and calculate total amount
  for (const item of items) {
    const product = await Product.findById(item.product);

    if (!product || !product.isActive) {
      return res.status(400).json({ success: false, message: `Product with ID ${item.product} is invalid.` });
    }

    // Validate variant
    const selectedVariant = product.variants.find(
      (v) => v.size === item.variant
    );
    if (!selectedVariant) {
      return res.status(400).json({
        success: false,
        message: `Variant ${item.variant} not found for product ${product.title}.`,
      });
    }

    // Validate packaging
    if (!product.packaging.includes(item.packaging)) {
      return res.status(400).json({
        success: false,
        message: `Packaging ${item.packaging} not valid for product ${product.title}.`,
      });
    }

    // Check stock
    if (selectedVariant.stock < item.quantity) {
      return res.status(400).json({
        success: false,
        message: `Insufficient stock for product ${product.title}, variant ${item.variant}.`,
      });
    }

    // Calculate item total
    const itemTotal = selectedVariant.price * item.quantity;
    totalAmount += itemTotal;

    // Add to populated items
    populatedItems.push({
      product: product._id,
      quantity: item.quantity,
      price: selectedVariant.price,
      variant: item.variant,
      packaging: item.packaging,
    });
  }

  // Apply coupon if provided
  let discount = 0;
  if (couponCode) {
    const coupon = await Coupon.findOne({ code: couponCode, isActive: true });

    if (!coupon) {
      return res.status(400).json({ success: false, message: 'Invalid or inactive coupon code.' });
    }

    // Validate coupon usage
    const couponValidation = Coupon.canApplyCoupon(coupon);
    if (!couponValidation.success) {
      return res.status(400).json({ success: false, message: couponValidation.message });
    }

    // Apply coupon
    discount = coupon.discountType === 'percentage' ? (totalAmount * (coupon.discount / 100)) : coupon.discount;
    totalAmount -= discount;

    // Ensure totalAmount doesn't go below zero
    totalAmount = Math.max(totalAmount, 0);

    // Increment used count
    coupon.usedCount += 1;
    if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
      coupon.isActive = false;
    }
    await coupon.save();
  }

  // Create order number
  const orderNumber = `ORD${Date.now()}`;

  const order = await Order.create({
    orderNumber,
    customer: req.user._id,
    items: populatedItems,
    totalAmount,
    paymentMethod,
    shippingAddress,
    billingAddress,
    status: 'pending',
    paymentStatus: 'pending',
    discount,
    couponCode: couponCode || null,
  });

  // Process payment
  try {
    if (paymentMethod === 'cod' || paymentMethod === 'cash_on_delivery') {
      // For Cash on Delivery, mark paymentStatus as 'pending'
      order.paymentStatus = 'pending';
      order.status = 'processing';
      await order.save();

      // Deduct stock
      await Promise.all(
        populatedItems.map(async (item) => {
          await Product.updateOne(
            { _id: item.product, 'variants.size': item.variant },
            {
              $inc: { 'variants.$.stock': -item.quantity },
            }
          );
        })
      );

      // Invalidate cache
      await deleteCache(`orders_${req.user._id}`);
      await deleteCache('all_orders');

      res.status(201).json({
        success: true,
        data: order,
        message: MESSAGES.ORDER.CREATE_SUCCESS,
      });
    } else {
      // Process online payment
      const paymentIntent = await processPayment(order, { paymentMethod });

      if (paymentIntent.status === 'succeeded') {
        // Update order status
        order.paymentStatus = 'paid';
        order.status = 'processing';
        order.paymentDetails = {
          transactionId: encrypt(paymentIntent.id),
          fee: paymentIntent.charges.data[0].balance_transaction, // Example
        };
        await order.save();

        // Create transaction record
        await Transaction.create({
          order: order._id,
          paymentMethod: order.paymentMethod,
          amount: order.totalAmount,
          status: 'completed',
          transactionId: encrypt(paymentIntent.id),
          metadata: paymentIntent,
        });

        // Deduct stock
        await Promise.all(
          populatedItems.map(async (item) => {
            await Product.updateOne(
              { _id: item.product, 'variants.size': item.variant },
              {
                $inc: { 'variants.$.stock': -item.quantity },
              }
            );
          })
        );

        // Invalidate cache
        await deleteCache(`orders_${req.user._id}`);
        await deleteCache('all_orders');

        res.status(201).json({
          success: true,
          data: order,
          message: MESSAGES.ORDER.CREATE_SUCCESS,
        });
      } else {
        // Payment failed
        await Order.findByIdAndDelete(order._id);

        res.status(500).json({ success: false, message: MESSAGES.ORDER.PAYMENT_FAILED });
      }
    }
  } catch (error) {
    logger.error('Payment Processing Error:', error);
    await Order.findByIdAndDelete(order._id);

    res.status(500).json({ success: false, message: MESSAGES.ORDER.PAYMENT_FAILED });
  }
});

// Example: getMyOrders method
exports.getMyOrders = asyncHandler(async (req, res, next) => {
  const { page = 1, limit = 10, status, dateFrom, dateTo } = req.query;

  let filter = { customer: req.user._id };

  if (status) {
    filter.status = status;
  }

  if (dateFrom || dateTo) {
    filter.createdAt = {};
    if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
    if (dateTo) filter.createdAt.$lte = new Date(dateTo);
  }

  const skip = (page - 1) * limit;

  try {
    const orders = await Order.find(filter)
      .populate('items.product', 'title price thumbnail images') // Include 'images' here
      .sort({ createdAt: -1 })
      .skip(parseInt(skip))
      .limit(parseInt(limit));

    const total = await Order.countDocuments(filter);

    res.status(200).json({
      success: true,
      count: orders.length,
      total,
      data: orders,
      message: 'Orders fetched successfully.',
    });
  } catch (error) {
    console.error('Error in getMyOrders:', error);
    res.status(500).json({
      success: false,
      message: error.message || "Cannot read properties of undefined (reading 'map')",
      errorDetails: error.stack || null,
    });
  }
});


// Similarly, update other methods like getAllOrders
exports.getAllOrders = asyncHandler(async (req, res, next) => {
  const { status, dateFrom, dateTo, customer, page = 1, limit = 10 } = req.query;
  let filter = {};

  if (status) {
    filter.status = status;
  }

  if (customer) {
    filter.customer = customer;
  }

  if (dateFrom || dateTo) {
    filter.createdAt = {};
    if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
    if (dateTo) filter.createdAt.$lte = new Date(dateTo);
  }

  const skip = (page - 1) * limit;

  try {
    const orders = await Order.find(filter)
      .populate('customer', 'name email')
      .populate('items.product', 'title price thumbnail') // Include 'thumbnail' here
      .sort({ createdAt: -1 })
      .skip(parseInt(skip))
      .limit(parseInt(limit));

    const total = await Order.countDocuments(filter);

    res.status(200).json({
      success: true,
      count: orders.length,
      total,
      data: orders,
      message: 'Orders fetched successfully.',
    });
  } catch (error) {
    console.error('Error in getAllOrders:', error);
    res.status(500).json({
      success: false,
      message: error.message || "An unexpected error occurred.",
      errorDetails: error.stack || null,
    });
  }
});


/**
 * @desc    Get all orders with optional filters
 * @route   GET /api/orders
 * @access  Private/Admin/Order Manager/Analytics Viewer
 */
exports.getAllOrders = asyncHandler(async (req, res, next) => {
  const { status, dateFrom, dateTo, customer, page = 1, limit = 10 } = req.query;
  let filter = {};

  if (status) {
    filter.status = status;
  }

  if (customer) {
    filter.customer = customer;
  }

  if (dateFrom || dateTo) {
    filter.createdAt = {};
    if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
    if (dateTo) filter.createdAt.$lte = new Date(dateTo);
  }

  const skip = (page - 1) * limit;

  try {
    const orders = await Order.find(filter)
      .populate('customer', 'name email')
      .populate('items.product', 'title price') // Changed 'name' to 'title'
      .sort({ createdAt: -1 })
      .skip(parseInt(skip))
      .limit(parseInt(limit));

    const total = await Order.countDocuments(filter);

    res.status(200).json({
      success: true,
      count: orders.length,
      total,
      data: orders,
      message: MESSAGES.ORDER.FETCH_SUCCESS || 'Orders fetched successfully.',
    });
  } catch (error) {
    console.error('Error in getAllOrders:', error);
    res.status(500).json({
      success: false,
      message: error.message || "An unexpected error occurred.",
      errorDetails: error.stack || null,
    });
  }
});

/**
 * @desc    Get a single order by ID
 * @route   GET /api/orders/:id
 * @access  Private/Admin/Order Manager/Customer
 */
exports.getOrderById = asyncHandler(async (req, res, next) => {
  const order = await Order.findById(req.params.id)
    .populate('customer', 'name email')
    .populate('items.product', 'title price'); // Changed 'name' to 'title'

  if (!order) {
    return res.status(404).json({
      success: false,
      message: MESSAGES.ORDER.ORDER_NOT_FOUND || 'Order not found.',
    });
  }

  // If the user is a customer, ensure they own the order
  if (req.user.role === 'user' && String(order.customer._id) !== String(req.user._id)) {
    return res.status(403).json({
      success: false,
      message: MESSAGES.GENERAL.FORBIDDEN || 'Access forbidden.',
    });
  }

  res.status(200).json({
    success: true,
    data: order,
    message: MESSAGES.ORDER.FETCH_SUCCESS || 'Order fetched successfully.',
  });
});

/**
 * @desc    Update order status
 * @route   PUT /api/orders/:id/status
 * @access  Private/Admin/Order Manager
 */
exports.updateOrderStatus = asyncHandler(async (req, res, next) => {
  const { status } = req.body;

  const order = await Order.findById(req.params.id);

  if (!order) {
    return res.status(404).json({
      success: false,
      message: MESSAGES.ORDER.ORDER_NOT_FOUND || 'Order not found.',
    });
  }

  // Define allowed status transitions
  const allowedTransitions = {
    pending: ['processing', 'cancelled'],
    processing: ['shipped', 'cancelled'],
    shipped: ['delivered', 'refunded'],
    delivered: ['refunded'],
    cancelled: [],
    refunded: [],
  };

  if (!allowedTransitions[order.status].includes(status)) {
    return res.status(400).json({ success: false, message: 'Invalid status transition.' });
  }

  order.status = status;

  // Handle specific status changes
  if (status === 'shipped') {
    // Additional logic for shipping
    // e.g., set shipping date, notify customer, etc.
  } else if (status === 'delivered') {
    // Additional logic for delivery
    // e.g., set delivery date, notify customer, etc.
  } else if (status === 'cancelled') {
    // Restock products
    await Promise.all(
      order.items.map(async (item) => {
        await Product.updateOne(
          { _id: item.product, 'variants.size': item.variant },
          { $inc: { 'variants.$.stock': item.quantity } }
        );
      })
    );
  }

  await order.save();

  // Invalidate cache
  await deleteCache(`orders_${req.user._id}`);
  await deleteCache('all_orders');

  res.status(200).json({
    success: true,
    data: order,
    message: MESSAGES.ORDER.UPDATE_SUCCESS || 'Order status updated successfully.',
  });
});

/**
 * @desc    Cancel an order
 * @route   POST /api/orders/:id/cancel
 * @access  Private/Admin/Order Manager
 */
exports.cancelOrder = asyncHandler(async (req, res, next) => {
  const { reason } = req.body;

  const order = await Order.findById(req.params.id);

  if (!order) {
    return res.status(404).json({
      success: false,
      message: MESSAGES.ORDER.ORDER_NOT_FOUND || 'Order not found.',
    });
  }

  if (order.status === 'cancelled' || order.status === 'refunded') {
    return res.status(400).json({
      success: false,
      message: 'Order is already cancelled or refunded.',
    });
  }

  order.status = 'cancelled';
  order.paymentStatus = 'refunded'; // Assuming full refund

  await order.save();

  // Restock products
  await Promise.all(
    order.items.map(async (item) => {
      await Product.updateOne(
        { _id: item.product, 'variants.size': item.variant },
        { $inc: { 'variants.$.stock': item.quantity } }
      );
    })
  );

  // Invalidate cache
  await deleteCache(`orders_${req.user._id}`);
  await deleteCache('all_orders');

  res.status(200).json({
    success: true,
    message: MESSAGES.ORDER.CANCEL_SUCCESS || 'Order cancelled successfully.',
  });
});
