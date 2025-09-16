const mongoose = require("mongoose");

const userSubscriptionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },
  subscriptionPlanId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "SubscriptionPlan",
    required: true
  },
  stripeCustomerId: {
    type: String,
    required: true,
    index: true
  },
  stripeSubscriptionId: {
    type: String,
    required: true,
    unique: true
    // unique: true automatically creates an index, no need for index: true
  },
  stripePriceId: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['active', 'cancelled', 'past_due', 'unpaid', 'incomplete', 'incomplete_expired', 'trialing', 'paused'],
    required: true,
    default: 'incomplete'
  },
  billingPeriod: {
    type: String,
    enum: ['monthly', 'yearly'],
    required: true,
    default: 'monthly'
  },
  currentPeriodStart: {
    type: Date,
    required: true
  },
  currentPeriodEnd: {
    type: Date,
    required: true
  },
  cancelAtPeriodEnd: {
    type: Boolean,
    default: false
  },
  cancelledAt: {
    type: Date,
    default: null
  },
  pausedAt: {
    type: Date,
    default: null
  },
  resumeAt: {
    type: Date,
    default: null
  },
  trialStart: {
    type: Date,
    default: null
  },
  trialEnd: {
    type: Date,
    default: null
  },
  nextBillingDate: {
    type: Date
  },
  lastPaymentAmount: {
    type: Number
  },
  lastPaymentDate: {
    type: Date
  },
  failedPaymentAttempts: {
    type: Number,
    default: 0
  },
  discount: {
    couponCode: String,
    percentOff: Number,
    amountOff: Number,
    validUntil: Date
  },
  isUpgrade: {
    type: Boolean,
    default: false
  },
  previousSubscriptionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "UserSubscription",
    default: null
  },
  upgradedToSubscriptionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "UserSubscription",
    default: null
  },
  paymentMethodId: {
    type: String,
    default: null
  },
  defaultPaymentMethod: {
    type: String,
    default: null
  },
  metadata: {
    type: Map,
    of: String,
    default: {}
  }
}, { 
  timestamps: true 
});

// Compound indexes for efficient queries
userSubscriptionSchema.index({ userId: 1, status: 1 });
userSubscriptionSchema.index({ userId: 1, createdAt: -1 });
// stripeCustomerId already has index: true in the field definition
userSubscriptionSchema.index({ status: 1, currentPeriodEnd: 1 });

// Virtual for checking if subscription is active
userSubscriptionSchema.virtual('isActive').get(function() {
  return ['active', 'trialing'].includes(this.status);
});

// Virtual for days remaining
userSubscriptionSchema.virtual('daysRemaining').get(function() {
  if (!this.currentPeriodEnd) return 0;
  const now = new Date();
  const end = new Date(this.currentPeriodEnd);
  const diff = Math.ceil((end - now) / (1000 * 60 * 60 * 24));
  return diff > 0 ? diff : 0;
});

const UserSubscription = mongoose.model('UserSubscription', userSubscriptionSchema);

module.exports = UserSubscription;