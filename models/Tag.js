const mongoose = require('mongoose');

const TagSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Tag name is required'],
      unique: true,
      trim: true,
      maxlength: [50, 'Tag name cannot exceed 50 characters'],
      match: [/^[a-zA-Z0-9-_ ]+$/, 'Tag name can only contain alphanumeric characters, dashes, underscores, and spaces'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [200, 'Description cannot exceed 200 characters'],
    },
    isActive: {
      type: Boolean,
      default: true, // Soft delete feature to deactivate tags instead of removing them
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Static method to find or create a tag by name
TagSchema.statics.findOrCreate = async function (name, description = '') {
  let tag = await this.findOne({ name });
  if (!tag) {
    tag = await this.create({ name, description });
  }
  return tag;
};

// Static method to get all active tags
TagSchema.statics.getActiveTags = function () {
  return this.find({ isActive: true }).sort({ name: 1 });
};

// Pre-save hook to ensure name is stored in lowercase for consistency
TagSchema.pre('save', function (next) {
  this.name = this.name.toLowerCase();
  next();
});

// Indexes for efficient querying
TagSchema.index({ name: 1 });
TagSchema.index({ isActive: 1 });

module.exports = mongoose.model('Tag', TagSchema);
