// services/uploadService.js
const cloudinary = require('../config/cloudinary');
const logger = require('../utils/logger');

const uploadToCloudinary = async (filePath, folder) => {
  try {
    const result = await cloudinary.uploader.upload(filePath, {
      folder,
      width: 800,
      height: 800,
      crop: 'fill',
    });
    return result.secure_url;
  } catch (error) {
    logger.error('Cloudinary Upload Error:', error);
    throw new Error('Image upload failed');
  }
};

module.exports = {
  uploadToCloudinary,
};
