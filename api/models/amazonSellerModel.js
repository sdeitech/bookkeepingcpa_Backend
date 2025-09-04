const mongoose = require("mongoose");

const amazonSellerSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true
    },
    sellerId: {
      type: String,
      required: true
    },
    marketplaceIds: [{
      type: String
    }],
    accessToken: {
      type: String,
      required: true
    },
    refreshToken: {
      type: String,
      required: true
    },
    tokenExpiresAt: {
      type: Date,
      required: true
    },
    region: {
      type: String,
      default: "us-east-1"
    },
    sellerName: {
      type: String
    },
    sellerEmail: {
      type: String
    },
    isActive: {
      type: Boolean,
      default: true
    },
    lastSyncedAt: {
      type: Date
    },
    isSandbox: {
      type: Boolean,
      default: false
    },
    permissions: {
      orders: { type: Boolean, default: false },
      inventory: { type: Boolean, default: false },
      reports: { type: Boolean, default: false },
      finance: { type: Boolean, default: false },
      catalog: { type: Boolean, default: false },
      feeds: { type: Boolean, default: false },
      shipments: { type: Boolean, default: false },
      products: { type: Boolean, default: false }
    },
    metadata: {
      type: Map,
      of: mongoose.Schema.Types.Mixed
    },
    lastError: {
      message: String,
      code: String,
      timestamp: Date
    }
  },
  { 
    timestamps: true 
  }
);

// Indexes for better query performance
// Note: userId already has an index from unique: true in the field definition
amazonSellerSchema.index({ sellerId: 1 });
amazonSellerSchema.index({ isActive: 1 });
amazonSellerSchema.index({ isSandbox: 1 });
amazonSellerSchema.index({ userId: 1, isSandbox: 1 }, { unique: true });

// Virtual to check if token needs refresh
amazonSellerSchema.virtual('needsTokenRefresh').get(function() {
  const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);
  return this.tokenExpiresAt <= fiveMinutesFromNow;
});

// Method to update last synced time
amazonSellerSchema.methods.updateLastSynced = function() {
  this.lastSyncedAt = new Date();
  return this.save();
};

// Method to mark as inactive
amazonSellerSchema.methods.deactivate = function() {
  this.isActive = false;
  return this.save();
};

// Method to activate
amazonSellerSchema.methods.activate = function() {
  this.isActive = true;
  return this.save();
};

module.exports = mongoose.model("AmazonSeller", amazonSellerSchema);