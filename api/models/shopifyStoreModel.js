const mongoose = require('mongoose');

const shopifyStoreSchema = new mongoose.Schema({
  // User association
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Shop basics
  shopDomain: {
    type: String,
    required: true
    // Removed unique: true to allow multiple users to connect to same shop
  },
  shopName: {
    type: String
  },
  shopEmail: {
    type: String
  },
  shopOwner: {
    type: String
  },
  shopPlan: {
    type: String
  },
  shopCountry: {
    type: String
  },
  shopCurrency: {
    type: String
  },
  shopTimezone: {
    type: String
  },
  
  // OAuth token (encrypted)
  // Not required because it gets cleared on disconnect
  accessToken: {
    type: String,
    required: false  // Changed to false to allow clearing on disconnect
  },
  scope: {
    type: String
  },
  
  // Session data for SDK
  sessionId: {
    type: String
  },
  state: {
    type: String
  },
  isOnline: {
    type: Boolean,
    default: true
  },
  
  // Status
  isActive: {
    type: Boolean,
    default: true
  },
  isPaused: {
    type: Boolean,
    default: false
  },
  
  // Sync tracking
  lastSyncedAt: {
    type: Date
  },
  lastOrderSync: {
    type: Date
  },
  
  // Stats (optional, for dashboard)
  stats: {
    totalOrders: {
      type: Number,
      default: 0
    },
    lastOrderDate: {
      type: Date
    }
  },
  
  // Error tracking
  lastError: {
    message: String,
    code: String,
    timestamp: Date
  },
  
  // Metadata for future use
  metadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed
  }
}, {
  timestamps: true
});

// Compound unique index - one shop per user
shopifyStoreSchema.index({ userId: 1, shopDomain: 1 }, { unique: true });

// Index for quick lookups
// Note: shopDomain already has unique:true in schema definition, so no need for separate index
shopifyStoreSchema.index({ userId: 1, isActive: 1 });

// Virtual to check if sync is needed (older than 1 hour)
shopifyStoreSchema.virtual('needsSync').get(function() {
  if (!this.lastSyncedAt) return true;
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  return this.lastSyncedAt < oneHourAgo;
});

// Method to update sync timestamp
shopifyStoreSchema.methods.updateLastSynced = function() {
  this.lastSyncedAt = new Date();
  return this.save();
};

// Method to mark as inactive
shopifyStoreSchema.methods.deactivate = function() {
  this.isActive = false;
  return this.save();
};

// Method to activate
shopifyStoreSchema.methods.activate = function() {
  this.isActive = true;
  this.isPaused = false;
  return this.save();
};

// Method to pause (temporary deactivation)
shopifyStoreSchema.methods.pause = function() {
  this.isPaused = true;
  return this.save();
};

// Method to resume
shopifyStoreSchema.methods.resume = function() {
  this.isPaused = false;
  return this.save();
};

// Method to record error
shopifyStoreSchema.methods.recordError = function(error) {
  this.lastError = {
    message: error.message || error,
    code: error.code || 'UNKNOWN_ERROR',
    timestamp: new Date()
  };
  return this.save();
};

// Method to clear error
shopifyStoreSchema.methods.clearError = function() {
  this.lastError = undefined;
  return this.save();
};

// Pre-save hook to ensure shopDomain is properly formatted
shopifyStoreSchema.pre('save', function(next) {
  if (this.shopDomain) {
    // Ensure shopDomain is lowercase and properly formatted
    this.shopDomain = this.shopDomain.toLowerCase().trim();
    
    // Add .myshopify.com if not present
    if (!this.shopDomain.includes('.myshopify.com')) {
      if (!this.shopDomain.includes('.')) {
        this.shopDomain = `${this.shopDomain}.myshopify.com`;
      }
    }
  }
  next();
});

module.exports = mongoose.model('ShopifyStore', shopifyStoreSchema);