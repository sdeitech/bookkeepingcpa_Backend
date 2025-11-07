const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema({
  // User who owns the document
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  // File information
  fileName: {
    type: String,
    required: true
  },
  originalName: {
    type: String,
    required: true
  },
  fileType: {
    type: String,
    required: true
  },
  mimeType: {
    type: String,
    required: true
  },
  fileSize: {
    type: Number,
    required: true
  },

  // Document categorization
  category: {
    type: String,
    required: true,
    enum: [
      'tax_returns',
      'w2_forms',
      '1099_forms',
      'bank_statements',
      'profit_loss',
      'balance_sheets',
      'legal_documents',
      'business_license',
      'ein_letter',
      'incorporation',
      'contracts',
      'invoices',
      'receipts',
      'passport',
      'drivers_license',
      'ssn_card',
      'other'
    ]
  },

  // Tax year (optional, for tax-related documents)
  taxYear: {
    type: Number,
    min: 1900,
    max: 2100
  },

  // Document status
  status: {
    type: String,
    enum: ['active', 'archived', 'deleted', 'processing', 'failed'],
    default: 'active'
  },

  // Local storage path
  localPath: {
    type: String,
    required: true
  },

  // Metadata
  description: {
    type: String,
    maxlength: 500
  },
  tags: [{
    type: String,
    trim: true
  }],

  // Security and privacy
  isSensitive: {
    type: Boolean,
    default: false
  },

  // Sharing (for future use)
  sharedWith: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    permission: {
      type: String,
      enum: ['view', 'download', 'edit'],
      default: 'view'
    },
    sharedAt: {
      type: Date,
      default: Date.now
    },
    expiresAt: Date
  }],

  // Access tracking
  accessCount: {
    type: Number,
    default: 0
  },
  lastAccessedAt: Date,
  lastAccessedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  // Upload information
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // Deletion tracking (for soft delete)
  deletedAt: Date,
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  // Audit trail
  history: [{
    action: {
      type: String,
      enum: ['uploaded', 'viewed', 'downloaded', 'updated', 'shared', 'deleted', 'restored']
    },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    performedAt: {
      type: Date,
      default: Date.now
    },
    details: String
  }],

  // CPA-specific fields
  reviewStatus: {
    type: String,
    enum: ['pending_review', 'reviewed', 'needs_clarification', 'approved', 'rejected'],
    default: 'pending_review'
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  reviewedAt: Date,
  reviewNotes: String,

  // Metadata for additional info
  metadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed
  }
}, {
  timestamps: true
});

// Indexes for performance
documentSchema.index({ userId: 1, status: 1, category: 1 });
documentSchema.index({ userId: 1, createdAt: -1 });
documentSchema.index({ category: 1, taxYear: 1 });
documentSchema.index({ tags: 1 });
documentSchema.index({ 'sharedWith.userId': 1 });

// Virtual for download URL
documentSchema.virtual('downloadUrl').get(function() {
  return `/api/documents/${this._id}/download`;
});

// Method to increment access count
documentSchema.methods.incrementAccessCount = async function() {
  this.accessCount += 1;
  this.lastAccessedAt = new Date();
  return this.save();
};

// Method to add history entry
documentSchema.methods.addHistoryEntry = async function(action, userId, details) {
  this.history.push({
    action,
    performedBy: userId,
    performedAt: new Date(),
    details
  });
  return this.save();
};

// Method to mark as deleted (soft delete)
documentSchema.methods.markAsDeleted = async function(userId) {
  this.status = 'deleted';
  this.deletedAt = new Date();
  this.deletedBy = userId;
  await this.addHistoryEntry('deleted', userId, 'Document soft deleted');
  return this.save();
};

// Method to restore deleted document
documentSchema.methods.restore = async function(userId) {
  this.status = 'active';
  this.deletedAt = undefined;
  this.deletedBy = undefined;
  await this.addHistoryEntry('restored', userId, 'Document restored');
  return this.save();
};

// Method to share document
documentSchema.methods.shareWith = async function(targetUserId, permission, expiresAt) {
  // Check if already shared with this user
  const existingShare = this.sharedWith.find(share => 
    share.userId.toString() === targetUserId.toString()
  );
  
  if (existingShare) {
    // Update existing share
    existingShare.permission = permission || existingShare.permission;
    existingShare.expiresAt = expiresAt || existingShare.expiresAt;
    existingShare.sharedAt = new Date();
  } else {
    // Add new share
    this.sharedWith.push({
      userId: targetUserId,
      permission: permission || 'view',
      sharedAt: new Date(),
      expiresAt
    });
  }
  
  await this.addHistoryEntry('shared', this.userId, `Shared with user ${targetUserId}`);
  return this.save();
};

// Method to remove share
documentSchema.methods.removeShare = async function(targetUserId) {
  this.sharedWith = this.sharedWith.filter(share => 
    share.userId.toString() !== targetUserId.toString()
  );
  await this.addHistoryEntry('shared', this.userId, `Removed share for user ${targetUserId}`);
  return this.save();
};

// Method to check if user has access
documentSchema.methods.hasAccess = function(userId) {
  // Owner always has access
  if (this.userId.toString() === userId.toString()) {
    return true;
  }
  
  // Check if shared with user
  const share = this.sharedWith.find(s => 
    s.userId.toString() === userId.toString()
  );
  
  if (!share) return false;
  
  // Check if share has expired
  if (share.expiresAt && new Date(share.expiresAt) < new Date()) {
    return false;
  }
  
  return true;
};

// Pre-save hook to ensure consistency
documentSchema.pre('save', function(next) {
  // Remove expired shares
  if (this.sharedWith && this.sharedWith.length > 0) {
    this.sharedWith = this.sharedWith.filter(share => {
      if (!share.expiresAt) return true;
      return new Date(share.expiresAt) >= new Date();
    });
  }
  
  next();
});

module.exports = mongoose.model('Document', documentSchema);