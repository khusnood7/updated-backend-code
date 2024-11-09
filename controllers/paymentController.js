// controllers/paymentController.js

const PaymentService = require('../services/paymentService');
const Order = require('../models/Order');
const Transaction = require('../models/Transaction');
const logger = require('../utils/logger');
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
 * Handle payment for an order
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.handlePayment = async (req, res) => {
  const { orderId, paymentDetails } = req.body;

  try {
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const paymentResult = await PaymentService.processPayment(order, paymentDetails);

    const transactionData = {
      order: order._id,
      paymentMethod: paymentDetails.paymentMethod,
      amount: order.totalAmount,
      status: paymentResult.success ? 'completed' : 'failed',
      transactionId: encrypt(paymentResult.paymentIntent?.id || paymentResult.payment?.id || 'N/A'),
      metadata: paymentResult.paymentIntent?.metadata || paymentResult.payment?.transactions || {},
    };

    const transaction = await Transaction.create(transactionData);

    logger.info(`Payment processed for order ${order._id}, transaction ${transaction.transactionId.slice(0, 4)}****`);

    res.status(200).json({
      success: true,
      message: 'Payment processed successfully',
      transactionId: transaction.transactionId.slice(0, 4) + '****', // Masked in response
    });
  } catch (error) {
    logger.error(`Payment processing failed for order ${orderId}: ${error.message}`);
    res.status(500).json({ success: false, message: 'Payment processing failed' });
  }
};

/**
 * Retrieve transaction details
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.getTransactionDetails = async (req, res) => {
  const { transactionId } = req.params;

  try {
    const transaction = await Transaction.findOne({ transactionId });
    if (!transaction) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }

    res.status(200).json({
      success: true,
      data: {
        order: transaction.order,
        paymentMethod: transaction.paymentMethod,
        amount: transaction.amount,
        status: transaction.status,
        transactionId: transaction.transactionId.slice(0, 4) + '****', // Masked in response
      },
    });
  } catch (error) {
    logger.error(`Failed to retrieve transaction ${transactionId}: ${error.message}`);
    res.status(500).json({ success: false, message: 'Failed to retrieve transaction details' });
  }
};
