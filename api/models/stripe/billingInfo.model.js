const mongoose = require("mongoose");

const billingInfoSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },
  stripeCustomerId: {
    type: String,
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    lowercase: true
  },
  phone: {
    type: String
  },
  address: {
    line1: {
      type: String,
      required: true
    },
    line2: String,
    city: {
      type: String,
      required: true
    },
    state: {
      type: String,
      required: true
    },
    country: {
      type: String,
      required: true,
      default: 'US'
    },
    postal_code: {
      type: String,
      required: true
    }
  },
  taxId: {
    type: String,
    default: null
  },
  companyName: {
    type: String,
    default: null
  },
  isDefault: {
    type: Boolean,
    default: true
  },
  paymentMethods: [{
    stripePaymentMethodId: String,
    type: {
      type: String,
      enum: ['card', 'bank_account'],
      default: 'card'
    },
    card: {
      brand: String,
      last4: String,
      expMonth: Number,
      expYear: Number
    },
    isDefault: Boolean,
    addedAt: {
      type: Date,
      default: Date.now
    }
  }],
  metadata: {
    type: Map,
    of: String,
    default: {}
  }
}, { 
  timestamps: true 
});

// Index for user lookups
billingInfoSchema.index({ userId: 1, isDefault: 1 });

// Pre-save hook to ensure only one default billing info per user
billingInfoSchema.pre('save', async function(next) {
  if (this.isDefault && this.isNew) {
    await this.constructor.updateMany(
      { userId: this.userId, _id: { $ne: this._id } },
      { isDefault: false }
    );
  }
  next();
});

const BillingInfo = mongoose.model('BillingInfo', billingInfoSchema);

module.exports = BillingInfo;
