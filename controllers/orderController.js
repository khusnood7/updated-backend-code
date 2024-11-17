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
const sendEmail = require('../services/emailService'); // Ensure the correct path

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

  // Set initial status to 'pending'
  const order = await Order.create({
    orderNumber,
    customer: req.user._id,
    items: populatedItems,
    totalAmount,
    paymentMethod,
    shippingAddress,
    billingAddress,
    status: 'pending', // Set to 'pending' initially
    paymentStatus: paymentMethod === 'cod' || paymentMethod === 'cash_on_delivery' ? 'pending' : 'pending', // Payment status remains 'pending' until order is accepted
    discount,
    couponCode: couponCode || null,
  });

  // Send Order Confirmation Email
  try {
    const populatedOrder = await order.populate('items.product', 'title thumbnail');

    const emailHtml = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Order Confirmation</title>
      <!-- Import Poppins Font from Google Fonts -->
      <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;600;700&display=swap" rel="stylesheet">
      <style>
        /* Reset some default styles */
        body, html {
          margin: 0;
          padding: 0;
          width: 100%;
          height: 100%;
        }

        .logo{
            margin-bottom: 20px;
            background: #061aab; 
            text-align: center;
            padding: 30px 20px;
        }

        /* Base styles */
        body {
          font-family: 'Poppins', sans-serif;
          background-color: #f4f6f8;
          padding: 20px;
          color: #333333;
        }

        .container {
          background-color: #ffffff;
          padding: 40px;
          border-radius: 12px;
          max-width: 600px;
          margin: auto;
          box-shadow: 0 4px 20px rgba(0,0,0,0.1);
          text-align: start;
        }

        .logo img {
          width: 150px;
          height: auto;
        }

        h2 {
          color: #000000; /* Brand Color */
          margin-bottom: 20px;
          font-weight: 700;
          font-size: 24px;
        }

        p {
          color: #000000;
          font-weight: 300;
          line-height: 1.6;
          margin-bottom: 20px;
          font-size: 16px;
        }

        a{
            color: #061aab;
            text-decoration: none;
        }

        .button {
          display: inline-block;
          padding: 14px 28px;
          background: #061aab; /* Solid Brand Color */
          color: #ffffff;
          text-decoration: none;
          border-radius: 4px;
          font-family: 'Poppins', sans-serif;
          font-weight: 600;
          transition: background 0.3s ease, transform 0.3s ease;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }

        .button:hover {
          background: #0041c4;
          transform: translateY(-2px);
          box-shadow: 0 6px 8px rgba(0, 0, 0, 0.15);
        }

        .order-summary {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 20px;
        }

        .order-summary th, .order-summary td {
          border: 1px solid #e0e0e0;
          padding: 10px;
          text-align: left;
        }

        .order-summary th {
          background-color: #f9f9f9;
        }

        .footer {
          margin-top: 30px;
          font-size: 14px;
          color: #000000;
          border-top: 1px solid #e0e0e0;
          padding-top: 20px;
        }

        .footer p {
          margin: 0;
        }

        /* Responsive Design */
        @media (max-width: 600px) {
          .container {
            padding: 20px;
          }

          .button {
            width: 100%;
            padding: 12px 0;
          }

          h2 {
            font-size: 20px;
          }

          p {
            font-size: 14px;
          }

          .order-summary th, .order-summary td {
            padding: 8px;
          }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <!-- Logo Section -->
        <div class="logo">
          <img src="https://res.cloudinary.com/dvbbsgj1u/image/upload/v1731090126/tesnhlpvlo6w9bdjepag.png" alt="Your Company Logo">
        </div>
      
        <h2>Order Confirmation</h2>
        <p>Hi ${req.user.name},</p>
        <p>Thank you for your purchase! Your order has been received and is currently pending approval. Once approved by our team, you will receive an update.</p>

        <table class="order-summary">
          <thead>
            <tr>
              <th>Product</th>
              <th>Title</th>
              <th>Quantity</th>
              <th>Price</th>
              <th>Subtotal</th>
            </tr>
          </thead>
          <tbody>
            ${populatedOrder.items.map(item => `
              <tr>
                <td><img src="${item.product.thumbnail || 'https://via.placeholder.com/50'}" alt="${item.product.title}" width="50" height="50"></td>
                <td>${item.product.title}</td>
                <td>${item.quantity}</td>
                <td>$${item.price.toFixed(2)}</td>
                <td>$${(item.price * item.quantity).toFixed(2)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <p><strong>Subtotal:</strong> $${(totalAmount + discount).toFixed(2)}</p>
        ${discount > 0 ? `<p><strong>Discount:</strong> -$${discount.toFixed(2)}</p>` : ''}
        <p><strong>Total Amount:</strong> $${totalAmount.toFixed(2)}</p>

        <p>Your order status is currently: <strong>${order.status}</strong>.</p>

        <p>If you have any questions or need further assistance, feel free to <a href="${process.env.SUPPORT_URL || 'http://localhost:5173/contact'}">contact our support team</a>.</p>

        <p>Thank you for choosing us!</p>
        
        <div class="footer">
          <p>Best regards, <br/>10X Formulas</p>
          <p><a href="${process.env.SUPPORT_URL || 'http://localhost:5173/contact'}">Contact Support</a></p>
        </div>
      </div>
    </body>
    </html>
    `;

    await sendEmail({
      email: req.user.email,
      subject: 'Your Order Confirmation - 10X Formulas',
      message: `Hi ${req.user.name}, your order has been received and is pending approval.`,
      html: emailHtml,
    });

    logger.info(`Order confirmation email sent to ${req.user.email}`);
  } catch (emailError) {
    logger.error(`Failed to send order confirmation email to ${req.user.email}: ${emailError.message}`);
    // Optionally, you can choose to proceed without failing the order creation
  }

  // For 'cod' payments, no immediate stock deduction or processing is done
  // Payment status remains 'pending' until the admin accepts the order

  // For online payments, payment is still 'pending' until admin accepts and processes the order
  // You might want to integrate payment verification based on your payment gateway

  // Invalidate cache if necessary
  await deleteCache(`orders_${req.user._id}`);
  await deleteCache('all_orders');

  res.status(201).json({
    success: true,
    data: order,
    message: MESSAGES.ORDER.CREATE_SUCCESS,
  });
});

/**
 * @desc    Admin Accept Order - Transition from Pending to Processing
 * @route   PUT /api/orders/:id/accept
 * @access  Private/Admin
 */
exports.acceptOrder = asyncHandler(async (req, res, next) => {
  const order = await Order.findById(req.params.id)
    .populate('customer', 'name email')
    .populate('items.product', 'title thumbnail variants');

  if (!order) {
    return res.status(404).json({
      success: false,
      message: MESSAGES.ORDER.ORDER_NOT_FOUND || 'Order not found.',
    });
  }

  if (order.status !== 'pending') {
    return res.status(400).json({
      success: false,
      message: `Only orders with 'pending' status can be accepted.`,
    });
  }

  // Update status to 'processing'
  order.status = 'processing';
  order.updatedAt = Date.now();

  // Deduct stock
  try {
    await Promise.all(
      order.items.map(async (item) => {
        const product = await Product.findById(item.product._id);
        const variant = product.variants.find(v => v.size === item.variant);
        if (variant.stock < item.quantity) {
          throw new Error(`Insufficient stock for product ${product.title}, variant ${item.variant}.`);
        }
        variant.stock -= item.quantity;
        await product.save();
      })
    );
  } catch (stockError) {
    logger.error(`Stock Deduction Error for Order ID ${order._id}: ${stockError.message}`);
    return res.status(400).json({
      success: false,
      message: stockError.message || 'Error deducting stock.',
    });
  }

  await order.save();

  // Invalidate cache
  await deleteCache(`orders_${order.customer._id}`);
  await deleteCache('all_orders');

  // Send Order Accepted Email
  try {
    const emailHtml = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Order Accepted</title>
      <!-- Import Poppins Font from Google Fonts -->
      <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;600;700&display=swap" rel="stylesheet">
      <style>
        /* Styles as defined in previous email templates */
        body, html {
          margin: 0;
          padding: 0;
          width: 100%;
          height: 100%;
        }

        .logo{
            margin-bottom: 20px;
            background: #061aab; 
            text-align: center;
            padding: 30px 20px;
        }

        /* Base styles */
        body {
          font-family: 'Poppins', sans-serif;
          background-color: #f4f6f8;
          padding: 20px;
          color: #333333;
        }

        .container {
          background-color: #ffffff;
          padding: 40px;
          border-radius: 12px;
          max-width: 600px;
          margin: auto;
          box-shadow: 0 4px 20px rgba(0,0,0,0.1);
          text-align: start;
        }

        .logo img {
          width: 150px;
          height: auto;
        }

        h2 {
          color: #000000; /* Brand Color */
          margin-bottom: 20px;
          font-weight: 700;
          font-size: 24px;
        }

        p {
          color: #000000;
          font-weight: 300;
          line-height: 1.6;
          margin-bottom: 20px;
          font-size: 16px;
        }

        a{
            color: #061aab;
            text-decoration: none;
        }

        .button {
          display: inline-block;
          padding: 14px 28px;
          background: #061aab; /* Solid Brand Color */
          color: #ffffff;
          text-decoration: none;
          border-radius: 4px;
          font-family: 'Poppins', sans-serif;
          font-weight: 600;
          transition: background 0.3s ease, transform 0.3s ease;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }

        .button:hover {
          background: #0041c4;
          transform: translateY(-2px);
          box-shadow: 0 6px 8px rgba(0, 0, 0, 0.15);
        }

        .order-summary {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 20px;
        }

        .order-summary th, .order-summary td {
          border: 1px solid #e0e0e0;
          padding: 10px;
          text-align: left;
        }

        .order-summary th {
          background-color: #f9f9f9;
        }

        .footer {
          margin-top: 30px;
          font-size: 14px;
          color: #000000;
          border-top: 1px solid #e0e0e0;
          padding-top: 20px;
        }

        .footer p {
          margin: 0;
        }

        /* Responsive Design */
        @media (max-width: 600px) {
          .container {
            padding: 20px;
          }

          .button {
            width: 100%;
            padding: 12px 0;
          }

          h2 {
            font-size: 20px;
          }

          p {
            font-size: 14px;
          }

          .order-summary th, .order-summary td {
            padding: 8px;
          }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <!-- Logo Section -->
        <div class="logo">
          <img src="https://res.cloudinary.com/dvbbsgj1u/image/upload/v1731090126/tesnhlpvlo6w9bdjepag.png" alt="Your Company Logo">
        </div>
      
        <h2>Your Order is Now Processing</h2>
        <p>Hi ${order.customer.name},</p>
        <p>Great news! Your order <strong>${order.orderNumber}</strong> has been accepted and is now being processed. We will notify you once your order has been shipped.</p>

        <table class="order-summary">
          <thead>
            <tr>
              <th>Product</th>
              <th>Title</th>
              <th>Quantity</th>
              <th>Price</th>
              <th>Subtotal</th>
            </tr>
          </thead>
          <tbody>
            ${order.items.map(item => `
              <tr>
                <td><img src="${item.product.thumbnail || 'https://via.placeholder.com/50'}" alt="${item.product.title}" width="50" height="50"></td>
                <td>${item.product.title}</td>
                <td>${item.quantity}</td>
                <td>$${item.price.toFixed(2)}</td>
                <td>$${(item.price * item.quantity).toFixed(2)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <p><strong>Subtotal:</strong> $${(order.totalAmount + order.discount).toFixed(2)}</p>
        ${order.discount > 0 ? `<p><strong>Discount:</strong> -$${order.discount.toFixed(2)}</p>` : ''}
        <p><strong>Total Amount:</strong> $${order.totalAmount.toFixed(2)}</p>

        <p>Your order status is currently: <strong>${order.status}</strong>.</p>

        <p>If you have any questions or need further assistance, feel free to <a href="${process.env.SUPPORT_URL || 'http://localhost:5173/contact'}">contact our support team</a>.</p>

        <p>Thank you for choosing us!</p>
        
        <div class="footer">
          <p>Best regards, <br/>10X Formulas</p>
          <p><a href="${process.env.SUPPORT_URL || 'http://localhost:5173/contact'}">Contact Support</a></p>
        </div>
      </div>
    </body>
    </html>
    `;

    await sendEmail({
      email: order.customer.email,
      subject: 'Your Order is Now Processing - 10X Formulas',
      message: `Hi ${order.customer.name}, your order is now processing.`,
      html: emailHtml,
    });

    logger.info(`Order accepted email sent to ${order.customer.email}`);
  } catch (emailError) {
    logger.error(`Failed to send order accepted email to ${order.customer.email}: ${emailError.message}`);
    // Optionally, handle email sending failure
  }

  res.status(200).json({
    success: true,
    data: order,
    message: 'Order has been accepted and is now processing.',
  });
});

/**
 * @desc    Update order status
 * @route   PUT /api/orders/:id/status
 * @access  Private/Admin/Order Manager
 */
exports.updateOrderStatus = asyncHandler(async (req, res, next) => {
  const { status } = req.body;

  // Fetch the order and populate necessary fields
  const order = await Order.findById(req.params.id)
    .populate('customer', 'name email')
    .populate('items.product', 'title thumbnail'); // Changed 'images' to 'thumbnail'

  if (!order) {
    logger.warn(`Order with ID ${req.params.id} not found.`);
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
    logger.warn(`Invalid status transition from ${order.status} to ${status} for Order ID ${req.params.id}.`);
    return res.status(400).json({ success: false, message: 'Invalid status transition.' });
  }

  // Update the order status
  order.status = status;

  // Handle specific status changes
  if (status === 'shipped') {
    // Set shipping date
    order.shippingDate = Date.now();
    logger.info(`Order ID ${order._id} marked as shipped.`);
  } else if (status === 'delivered') {
    // Set delivery date
    order.deliveryDate = Date.now();
    logger.info(`Order ID ${order._id} marked as delivered.`);

    // Send Order Delivered Email
    try {
      logger.info(`Attempting to send delivery email to ${order.customer.email} for Order ID ${order._id}.`);

      const emailHtml = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>Order Delivered</title>
        <!-- Import Poppins Font from Google Fonts -->
        <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;600;700&display=swap" rel="stylesheet">
        <style>
          /* Reset some default styles */
          body, html {
            margin: 0;
            padding: 0;
            width: 100%;
            height: 100%;
          }

          .logo{
              margin-bottom: 20px;
              background: #061aab; 
              text-align: center;
              padding: 30px 20px;
          }

          /* Base styles */
          body {
            font-family: 'Poppins', sans-serif;
            background-color: #f4f6f8;
            padding: 20px;
            color: #333333;
          }

          .container {
            background-color: #ffffff;
            padding: 40px;
            border-radius: 12px;
            max-width: 600px;
            margin: auto;
            box-shadow: 0 4px 20px rgba(0,0,0,0.1);
            text-align: start;
          }

          .logo img {
            width: 150px;
            height: auto;
          }

          h2 {
            color: #000000; /* Brand Color */
            margin-bottom: 20px;
            font-weight: 700;
            font-size: 24px;
          }

          p {
            color: #000000;
            font-weight: 300;
            line-height: 1.6;
            margin-bottom: 20px;
            font-size: 16px;
          }

          a{
              color: #061aab;
              text-decoration: none;
          }

          .button {
            display: inline-block;
            padding: 14px 28px;
            background: #061aab; /* Solid Brand Color */
            color: #ffffff;
            text-decoration: none;
            border-radius: 4px;
            font-family: 'Poppins', sans-serif;
            font-weight: 600;
            transition: background 0.3s ease, transform 0.3s ease;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          }

          .button:hover {
            background: #0041c4;
            transform: translateY(-2px);
            box-shadow: 0 6px 8px rgba(0, 0, 0, 0.15);
          }

          .order-summary {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
          }

          .order-summary th, .order-summary td {
            border: 1px solid #e0e0e0;
            padding: 10px;
            text-align: left;
          }

          .order-summary th {
            background-color: #f9f9f9;
          }

          .footer {
            margin-top: 30px;
            font-size: 14px;
            color: #000000;
            border-top: 1px solid #e0e0e0;
            padding-top: 20px;
          }

          .footer p {
            margin: 0;
          }

          /* Responsive Design */
          @media (max-width: 600px) {
            .container {
              padding: 20px;
            }

            .button {
              width: 100%;
              padding: 12px 0;
            }

            h2 {
              font-size: 20px;
            }

            p {
              font-size: 14px;
            }

            .order-summary th, .order-summary td {
              padding: 8px;
            }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <!-- Logo Section -->
          <div class="logo">
            <img src="https://res.cloudinary.com/dvbbsgj1u/image/upload/v1731090126/tesnhlpvlo6w9bdjepag.png" alt="Your Company Logo">
          </div>
        
          <h2>Your Order Has Been Delivered!</h2>
          <p>Hi ${order.customer.name},</p>
          <p>We're thrilled to let you know that your order has been successfully delivered. We hope you enjoy your purchase! Here are the details of your order:</p>

          <table class="order-summary">
            <thead>
              <tr>
                <th>Product</th>
                <th>Title</th>
                <th>Quantity</th>
                <th>Price</th>
                <th>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              ${order.items.map(item => `
                <tr>
                  <td><img src="${item.product.thumbnail || 'https://via.placeholder.com/50'}" alt="${item.product.title}" width="50" height="50"></td>
                  <td>${item.product.title}</td>
                  <td>${item.quantity}</td>
                  <td>$${item.price.toFixed(2)}</td>
                  <td>$${(item.price * item.quantity).toFixed(2)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <p><strong>Subtotal:</strong> $${(order.totalAmount + order.discount).toFixed(2)}</p>
          ${order.discount > 0 ? `<p><strong>Discount:</strong> -$${order.discount.toFixed(2)}</p>` : ''}
          <p><strong>Total Amount:</strong> $${order.totalAmount.toFixed(2)}</p>

          <p>Your order status is currently: <strong>${order.status}</strong>.</p>

          <p>If you have any questions or need further assistance, feel free to <a href="${process.env.SUPPORT_URL || 'http://localhost:5173/contact'}">contact our support team</a>.</p>

          <p>Thank you for shopping with us!</p>
          
          <div class="footer">
            <p>Best regards, <br/>10X Formulas</p>
            <p><a href="${process.env.SUPPORT_URL || 'http://localhost:5173/contact'}">Contact Support</a></p>
          </div>
        </div>
      </body>
      </html>
      `;

      await sendEmail({
        email: order.customer.email,
        subject: 'Your Order Has Been Delivered - 10X Formulas',
        message: `Hi ${order.customer.name}, your order has been delivered.`,
        html: emailHtml,
      });

      logger.info(`Order delivered email sent to ${order.customer.email}`);
    } catch (emailError) {
      logger.error(`Failed to send order delivered email to ${order.customer.email}: ${emailError.message}`);
      // Optionally, handle email sending failure
    }
  }

  await order.save();

  // Invalidate cache
  await deleteCache(`orders_${order.customer._id}`);
  await deleteCache('all_orders');

  res.status(200).json({
    success: true,
    data: order,
    message: 'Order status updated successfully.',
  });
});

/**
 * @desc    Cancel an order
 * @route   POST /api/orders/:id/cancel
 * @access  Private/Admin/Order Manager
 */
exports.cancelOrder = asyncHandler(async (req, res, next) => {
  const { reason } = req.body;

  const order = await Order.findById(req.params.id)
    .populate('customer', 'name email')
    .populate('items.product', 'title thumbnail');

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

  // If the order is in 'processing' or beyond, restore stock
  if (['processing', 'shipped', 'delivered'].includes(order.status)) {
    await Promise.all(
      order.items.map(async (item) => {
        await Product.updateOne(
          { _id: item.product, 'variants.size': item.variant },
          { $inc: { 'variants.$.stock': item.quantity } }
        );
      })
    );
  }

  order.status = 'cancelled';
  order.paymentStatus = 'refunded'; // Assuming full refund
  order.cancellationReason = reason || 'No reason provided.';
  order.updatedAt = Date.now();

  await order.save();

  // Invalidate cache
  await deleteCache(`orders_${order.customer._id}`);
  await deleteCache('all_orders');

  // Send Order Cancellation Email
  try {
    const emailHtml = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Order Cancellation</title>
      <!-- Import Poppins Font from Google Fonts -->
      <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;600;700&display=swap" rel="stylesheet">
      <style>
        /* Reset some default styles */
        body, html {
          margin: 0;
          padding: 0;
          width: 100%;
          height: 100%;
        }

        .logo{
            margin-bottom: 20px;
            background: #061aab; 
            text-align: center;
            padding: 30px 20px;
        }

        /* Base styles */
        body {
          font-family: 'Poppins', sans-serif;
          background-color: #f4f6f8;
          padding: 20px;
          color: #333333;
        }

        .container {
          background-color: #ffffff;
          padding: 40px;
          border-radius: 12px;
          max-width: 600px;
          margin: auto;
          box-shadow: 0 4px 20px rgba(0,0,0,0.1);
          text-align: start;
        }

        .logo img {
          width: 150px;
          height: auto;
        }

        h2 {
          color: #000000; /* Brand Color */
          margin-bottom: 20px;
          font-weight: 700;
          font-size: 24px;
        }

        p {
          color: #000000;
          font-weight: 300;
          line-height: 1.6;
          margin-bottom: 20px;
          font-size: 16px;
        }

        a{
            color: #061aab;
            text-decoration: none;
        }

        .button {
          display: inline-block;
          padding: 14px 28px;
          background: #061aab; /* Solid Brand Color */
          color: #ffffff;
          text-decoration: none;
          border-radius: 4px;
          font-family: 'Poppins', sans-serif;
          font-weight: 600;
          transition: background 0.3s ease, transform 0.3s ease;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }

        .button:hover {
          background: #0041c4;
          transform: translateY(-2px);
          box-shadow: 0 6px 8px rgba(0, 0, 0, 0.15);
        }

        .footer {
          margin-top: 30px;
          font-size: 14px;
          color: #000000;
          border-top: 1px solid #e0e0e0;
          padding-top: 20px;
        }

        .footer p {
          margin: 0;
        }

        /* Responsive Design */
        @media (max-width: 600px) {
          .container {
            padding: 20px;
          }

          .button {
            width: 100%;
            padding: 12px 0;
          }

          h2 {
            font-size: 20px;
          }

          p {
            font-size: 14px;
          }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <!-- Logo Section -->
        <div class="logo">
          <img src="https://res.cloudinary.com/dvbbsgj1u/image/upload/v1731090126/tesnhlpvlo6w9bdjepag.png" alt="Your Company Logo">
        </div>
      
        <h2>Your Order Has Been Cancelled</h2>
        <p>Hi ${order.customer.name},</p>
        <p>We're sorry to inform you that your order with order number <strong>${order.orderNumber}</strong> has been cancelled.</p>
        ${reason ? `<p>Reason: ${reason}</p>` : ''}
        <p>If you have any questions or need further assistance, feel free to <a href="${process.env.SUPPORT_URL || 'http://localhost:5173/contact'}">contact our support team</a>.</p>

        <p>Thank you for your understanding.</p>
        
        <div class="footer">
          <p>Best regards, <br/>10X Formulas</p>
          <p><a href="${process.env.SUPPORT_URL || 'http://localhost:5173/contact'}">Contact Support</a></p>
        </div>
      </div>
    </body>
    </html>
    `;

    await sendEmail({
      email: order.customer.email,
      subject: 'Your Order Has Been Cancelled - 10X Formulas',
      message: `Hi ${order.customer.name}, your order has been cancelled.`,
      html: emailHtml,
    });

    logger.info(`Order cancellation email sent to ${order.customer.email}`);
  } catch (emailError) {
    logger.error(`Failed to send order cancellation email to ${order.customer.email}: ${emailError.message}`);
    // Optionally, handle email sending failure
  }

  res.status(200).json({
    success: true,
    message: MESSAGES.ORDER.CANCEL_SUCCESS || 'Order cancelled successfully.',
  });
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
      .populate('items.product', 'title thumbnail') // Changed 'images' to 'thumbnail'
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
      message: error.message || "Cannot read properties of undefined (reading 'map')",
      errorDetails: error.stack || null,
    });
  }
});

/**
 * @desc    Get authenticated user's orders
 * @route   GET /api/orders/my-orders
 * @access  Private/Customer
 */
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
      .populate('items.product', 'title thumbnail') // Changed 'images' to 'thumbnail'
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

/**
 * @desc    Get a single order by ID
 * @route   GET /api/orders/:id
 * @access  Private/Admin/Order Manager/Customer
 */
exports.getOrderById = asyncHandler(async (req, res, next) => {
  const order = await Order.findById(req.params.id)
    .populate('customer', 'name email')
    .populate('items.product', 'title thumbnail'); // Changed 'images' to 'thumbnail'

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
