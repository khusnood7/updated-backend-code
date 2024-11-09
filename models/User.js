// models/User.js


const mongoose = require('mongoose');


const UserSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please add a name'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Please add an email'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
        'Please add a valid email',
      ],
    },
    password: {
      type: String,
      required: [true, 'Please add a password'],
      minlength: 6,
      select: false, // Do not return password by default
    },
    role: {
      type: String,
      enum: [
        'super-admin',
        'product-manager',
        'order-manager',
        'content-manager',
        'customer-support-manager',
        'marketing-manager',
        'analytics-viewer',
        'user',
      ],
      default: 'user',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    profilePicture: {
      type: String,
      default: '', // URL to the profile picture
    },
    resetPasswordToken: String,
    resetPasswordExpire: Date,
  },
  { timestamps: true }
);


// Exclude password and other sensitive fields from JSON responses
UserSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.resetPasswordToken;
  delete obj.resetPasswordExpire;
  return obj;
};


module.exports = mongoose.model('User', UserSchema);



