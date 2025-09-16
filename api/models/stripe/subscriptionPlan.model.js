const mongoose = require("mongoose");

const subscriptionPlanSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Plan name is required'],
    unique: true,
    trim: true,
  },
  description: {
    type: String,
    default: ''
  },
  features: [{
    type: String,
    required: true,
  }],
  pricePerMonth: {
    type: Number,
    required: [true, 'Monthly price is required'],
  },
  pricePerYear: {
    type: Number,
    default: function() {
      return this.pricePerMonth * 10; // 2 months free on yearly
    }
  },
  billingPeriod: {
    type: String,
    enum: ['monthly', 'yearly', 'both'],
    default: 'both'
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  isPopular: {
    type: Boolean,
    default: false
  },
  stripePriceIdMonthly: {
    type: String,
    unique: true,
    sparse: true
  },
  stripePriceIdYearly: {
    type: String,
    unique: true,
    sparse: true
  },
  stripeProductId: {
    type: String,
    unique: true,
    sparse: true
  },
  features: {
    amazonIntegration: { type: Boolean, default: false },
    walmartIntegration: { type: Boolean, default: false },
    shopifyIntegration: { type: Boolean, default: false },
    advancedAnalytics: { type: Boolean, default: false },
    prioritySupport: { type: Boolean, default: false },
    customReports: { type: Boolean, default: false }
  },
  trialDays: {
    type: Number,
    default: 7
  },
  sortOrder: {
    type: Number,
    default: 0
  },
  metadata: {
    type: Map,
    of: String,
    default: {}
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Admin",
    required: true
  }
}, { 
  timestamps: true 
});

// Indexes for efficient queries
subscriptionPlanSchema.index({ isActive: 1, sortOrder: 1 });
// stripeProductId already has unique: true which creates an index automatically

const SubscriptionPlan = mongoose.model('SubscriptionPlan', subscriptionPlanSchema);

module.exports = SubscriptionPlan;