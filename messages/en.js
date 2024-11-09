// messages/en.js

const MESSAGES = {
    AUTH: {
      REGISTER_SUCCESS: 'User registered successfully.',
      LOGIN_SUCCESS: 'User logged in successfully.',
      LOGOUT_SUCCESS: 'Logged out successfully.',
      INVALID_CREDENTIALS: 'Invalid email or password.',
      USER_EXISTS: 'User already exists.',
      FORGOT_PASSWORD_SUCCESS: 'Password reset email sent.',
      RESET_PASSWORD_SUCCESS: 'Password reset successfully.',
      EMAIL_SEND_FAILURE: 'Email could not be sent.',
      INVALID_TOKEN: 'Invalid or expired token.',
    },
    USER: {
      FETCH_SUCCESS: 'Users fetched successfully.',
      UPDATE_SUCCESS: 'User updated successfully.',
      DELETE_SUCCESS: 'User deactivated successfully.',
      RESET_PASSWORD_SUCCESS: 'User password reset successfully.',
      USER_NOT_FOUND: 'User not found.',
    },
    PRODUCT: {
      CREATE_SUCCESS: 'Product created successfully.',
      FETCH_SUCCESS: 'Products fetched successfully.',
      UPDATE_SUCCESS: 'Product updated successfully.',
      DELETE_SUCCESS: 'Product deactivated successfully.',
      PRODUCT_NOT_FOUND: 'Product not found.',
      UPLOAD_SUCCESS: 'Image uploaded successfully.',
    },
    CATEGORY: {
      CREATE_SUCCESS: 'Category created successfully.',
      FETCH_SUCCESS: 'Categories fetched successfully.',
      UPDATE_SUCCESS: 'Category updated successfully.',
      DELETE_SUCCESS: 'Category deleted successfully.',
      CATEGORY_NOT_FOUND: 'Category not found.',
    },
    COUPON: {
      CREATE_SUCCESS: 'Coupon created successfully.',
      FETCH_SUCCESS: 'Coupons fetched successfully.',
      UPDATE_SUCCESS: 'Coupon updated successfully.',
      DELETE_SUCCESS: 'Coupon deactivated successfully.',
      COUPON_NOT_FOUND: 'Coupon not found.',
      COUPON_EXISTS: 'Coupon code already exists.',
    },
    REPORT: {
      SALES_SUMMARY_SUCCESS: 'Sales summary fetched successfully.',
      TOP_PRODUCTS_SUCCESS: 'Top-selling products fetched successfully.',
      CUSTOMER_ANALYTICS_SUCCESS: 'Customer analytics fetched successfully.',
      EXPORT_SUCCESS: 'Sales report exported successfully.',
      INVALID_EXPORT_TYPE: 'Invalid export type.',
    },
    BLOG: {
      CREATE_SUCCESS: 'Blog post created successfully.',
      FETCH_SUCCESS: 'Blog posts fetched successfully.',
      UPDATE_SUCCESS: 'Blog post updated successfully.',
      DELETE_SUCCESS: 'Blog post deleted successfully.',
      UPLOAD_SUCCESS: 'Blog image uploaded successfully.',
      BLOG_NOT_FOUND: 'Blog post not found.',
    },
    FAQ: {
      CREATE_SUCCESS: 'FAQ created successfully.',
      FETCH_SUCCESS: 'FAQs fetched successfully.',
      UPDATE_SUCCESS: 'FAQ updated successfully.',
      DELETE_SUCCESS: 'FAQ deleted successfully.',
      FAQ_NOT_FOUND: 'FAQ not found.',
    },
    REVIEW: {
      CREATE_SUCCESS: 'Review submitted successfully.',
      FETCH_SUCCESS: 'Reviews fetched successfully.',
      UPDATE_SUCCESS: 'Review updated successfully.',
      DELETE_SUCCESS: 'Review deleted successfully.',
      REVIEW_NOT_FOUND: 'Review not found.',
    },
    PAYMENT: {
      PROCESS_SUCCESS: 'Payment processed successfully.',
      REFUND_SUCCESS: 'Payment refunded successfully.',
      PAYMENT_FAILED: 'Payment processing failed.',
    },
    SETTINGS: {
      FETCH_SUCCESS: 'Settings fetched successfully.',
      UPDATE_SUCCESS: 'Settings updated successfully.',
      SETTINGS_NOT_FOUND: 'Settings not found.',
    },
    GENERAL: {
      SERVER_ERROR: 'Server error. Please try again later.',
      INVALID_INPUT: 'Invalid input.',
      UNAUTHORIZED: 'Unauthorized access.',
      FORBIDDEN: 'Forbidden.',
      NOT_FOUND: 'Resource not found.',
      RATE_LIMIT_EXCEEDED: 'Too many requests. Please try again later.',
    },
  };
  
  module.exports = MESSAGES;
  