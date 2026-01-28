const mongoose = require('mongoose');

const questionnaireResponseSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, 'Email is required'],
    trim: true,
    lowercase: true,
    match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address'],
    index: true
  },
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true
  },
  // Optional link to an onboarded User (set after payment/onboarding)
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true
  },
  answers: {
    q1Revenue: {
      type: String,
      enum: ['R1', 'R2', 'R3', null],
      default: null
    },
    q2Support: {
      type: String,
      enum: ['S1', 'S2', 'S3', null],
      default: null
    },
    q3Customization: {
      type: String,
      enum: ['C1', 'C2', null],
      default: null
    },
    q4Structure: {
      type: String,
      enum: ['single-llc', 'partnership', 's-corp', 'c-corp', null],
      default: null
    },
    q5Cleanup: {
      type: String,
      enum: ['T1', 'T2', 'T3', null],
      default: null
    },
    q6Tax: {
      type: String,
      enum: ['X1', 'X2', 'X3', null],
      default: null
    }
  },
  recommendedPlan: {
    type: String,
    enum: ['startup', 'essential', 'enterprise'],
    required: [true, 'Recommended plan is required']
  },
  status: {
    type: String,
    enum: ['pending', 'proposal_sent', 'signed', 'onboarded'],
    default: 'pending',
    index: true
  },
  // When payment is confirmed (via Ignition/Stripe webhook flow)
  paidAt: {
    type: Date,
    default: null
  },
  metadata: {
    ipAddress: {
      type: String,
      default: null
    },
    userAgent: {
      type: String,
      default: null
    },
    source: {
      type: String,
      default: 'web'
    },
    ignitionClientId: {
      type: String,
      default: null
    },
    calendlyEventId: {
      type: String,
      default: null
    }
  }
}, {
  timestamps: true
});

// Index for efficient queries
questionnaireResponseSchema.index({ email: 1 });
questionnaireResponseSchema.index({ status: 1 });
questionnaireResponseSchema.index({ createdAt: -1 });
questionnaireResponseSchema.index({ recommendedPlan: 1 });

// Prevent duplicate submissions from same email (optional - can be removed if needed)
questionnaireResponseSchema.index({ email: 1 }, { unique: false }); // Changed to non-unique to allow multiple submissions

module.exports = mongoose.model('QuestionnaireResponse', questionnaireResponseSchema);

