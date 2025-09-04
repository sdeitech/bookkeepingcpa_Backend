const mongoose = require('mongoose');

const onboardingSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  currentStep: {
    type: Number,
    default: 1,
    min: 1,
    max: 4
  },
  completed: {
    type: Boolean,
    default: false
  },
  completedAt: {
    type: Date,
    default: null
  },
  data: {
    // Step 1: Business Needs
    businessNeeds: {
      type: String,
      enum: ['browsing', 'bookkeeping', 'comprehensive', '', null],
      default: null
    },
    
    // Step 2: Bookkeeper History
    previousBookkeeper: {
      type: String,
      enum: ['yes', 'no', '', null],
      default: null
    },
    
    // Step 3: Business Details
    businessDetails: {
      businessName: {
        type: String,
        default: ''
      },
      businessType: {
        type: String,
        enum: ['sole_proprietorship', 'llc', 'corporation', 'partnership', 's_corp', 'nonprofit', ''],
        default: ''
      },
      yearStarted: {
        type: String,
        default: ''
      },
      employeeCount: {
        type: String,
        enum: ['1', '2-5', '6-10', '11-25', '26-50', '50+', ''],
        default: ''
      },
      monthlyRevenue: {
        type: String,
        enum: ['0-10k', '10k-50k', '50k-100k', '100k-500k', '500k-1m', '1m+', ''],
        default: ''
      }
    },
    
    // Step 4: Industry
    industry: {
      type: String,
      enum: [
        'ecommerce',
        'professional_services',
        'social_media',
        'real_estate',
        'agency',
        'saas',
        '3pl',
        'retail',
        'ai_ventures',
        'others',
        '',  // Allow empty string for in-progress saves
        null
      ],
      default: null
    }
  },
  metadata: {
    lastSavedAt: {
      type: Date,
      default: Date.now
    },
    ipAddress: String,
    userAgent: String,
    source: {
      type: String,
      enum: ['web', 'mobile', 'api'],
      default: 'web'
    }
  }
}, {
  timestamps: true
});

// Index for efficient queries
// userId already has an index from unique: true
onboardingSchema.index({ completed: 1 });
onboardingSchema.index({ createdAt: -1 });

// Pre-save middleware to update lastSavedAt
onboardingSchema.pre('save', function(next) {
  this.metadata.lastSavedAt = new Date();
  
  // Check if all steps are completed
  const isComplete = 
    this.data.businessNeeds !== null &&
    this.data.previousBookkeeper !== null &&
    this.data.businessDetails.businessName !== '' &&
    this.data.businessDetails.businessType !== '' &&
    this.data.industry !== null;
  
  if (isComplete && !this.completed) {
    this.completed = true;
    this.completedAt = new Date();
  }
  
  next();
});

// Instance method to get completion percentage
onboardingSchema.methods.getCompletionPercentage = function() {
  let completedFields = 0;
  const totalFields = 7; // Total required fields
  
  if (this.data.businessNeeds) completedFields++;
  if (this.data.previousBookkeeper) completedFields++;
  if (this.data.businessDetails.businessName) completedFields++;
  if (this.data.businessDetails.businessType) completedFields++;
  if (this.data.businessDetails.yearStarted) completedFields++;
  if (this.data.businessDetails.employeeCount) completedFields++;
  if (this.data.industry) completedFields++;
  
  return Math.round((completedFields / totalFields) * 100);
};

// Static method to find incomplete onboardings
onboardingSchema.statics.findIncomplete = function(daysOld = 7) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);
  
  return this.find({
    completed: false,
    createdAt: { $lt: cutoffDate }
  });
};

const Onboarding = mongoose.model('Onboarding', onboardingSchema);

module.exports = Onboarding;