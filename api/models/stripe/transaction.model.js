const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },
  subscriptionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "UserSubscription",
    required: true
  },
  stripeInvoiceId: {
    type: String,
    required: true,
    unique: true
    // unique: true automatically creates an index, no need for index: true
  },
  stripePaymentIntentId: {
    type: String,
    index: true
  },
  stripeChargeId: {
    type: String,
    index: true
  },
  amount: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    default: 'usd',
    lowercase: true
  },
  status: {
    type: String,
    enum: ['succeeded', 'failed', 'pending', 'refunded', 'cancelled', 'processing'],
    required: true
  },
  type: {
    type: String,
    enum: ['subscription', 'one-time', 'refund', 'upgrade', 'downgrade'],
    default: 'subscription'
  },
  invoiceUrl: {
    type: String,
    required: false,  // Not required for cancellations
    default: ''
  },
  invoicePdf: {
    type: String,
    required: false,  // Not required for cancellations
    default: ''
  },
  description: {
    type: String,
    required: true
  },
  periodStart: {
    type: Date,
    required: false  // Not always available for cancellations
  },
  periodEnd: {
    type: Date,
    required: false  // Not always available for cancellations
  },
  refundedAmount: {
    type: Number,
    default: 0
  },
  refundedAt: {
    type: Date,
    default: null
  },
  failureReason: {
    type: String,
    default: null
  },
  paymentMethod: {
    type: {
      type: String,
      enum: ['card', 'bank_account', 'paypal'],
      default: 'card'
    },
    last4: String,
    brand: String,
    expiryMonth: Number,
    expiryYear: Number
  },
  billingDetails: {
    name: String,
    email: String,
    phone: String,
    address: {
      line1: String,
      line2: String,
      city: String,
      state: String,
      country: String,
      postal_code: String
    }
  },
  metadata: {
    type: Map,
    of: String,
    default: {}
  }
}, { 
  timestamps: true 
});

// Indexes for efficient queries
transactionSchema.index({ userId: 1, createdAt: -1 });
transactionSchema.index({ subscriptionId: 1, createdAt: -1 });
transactionSchema.index({ status: 1, createdAt: -1 });
// stripePaymentIntentId already has index: true in the field definition

// Virtual for formatted amount
transactionSchema.virtual('formattedAmount').get(function() {
  return `$${(this.amount / 100).toFixed(2)}`;
});

const Transaction = mongoose.model('Transaction', transactionSchema);

module.exports = Transaction;