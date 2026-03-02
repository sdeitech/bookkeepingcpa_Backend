const mongoose = require('mongoose');

const taskDocumentSchema = new mongoose.Schema({
  // Task reference
  taskId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Task',
    required: true,
    index: true
  },

  // Document type (links to task's requiredDocuments)
  documentType: {
    type: String,
    required: true,
    maxlength: 200,
    index: true
  },

  // Owner (client who owns the task)
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
  fileSize: {
    type: Number,
    required: true
  },
  mimeType: {
    type: String,
    required: true
  },
  localPath: {
    type: String,
    required: true
  },

  // Upload information
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // Review workflow
  reviewStatus: {
    type: String,
    enum: ['pending_review', 'approved', 'rejected'],
    default: 'pending_review',
    index: true
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  reviewedAt: {
    type: Date,
    default: null
  },
  reviewNotes: {
    type: String,
    maxlength: 1000,
    default: null
  },

  // Soft delete
  status: {
    type: String,
    enum: ['active', 'deleted'],
    default: 'active',
    index: true
  },
  deletedAt: {
    type: Date,
    default: null
  },
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },

  // TODO: Audit Trail - Implement when needed
  // Track all review status changes for audit purposes
  // reviewHistory: [{
  //   reviewStatus: {
  //     type: String,
  //     enum: ['pending_review', 'approved', 'rejected']
  //   },
  //   changedBy: {
  //     type: mongoose.Schema.Types.ObjectId,
  //     ref: 'User'
  //   },
  //   changedAt: {
  //     type: Date,
  //     default: Date.now
  //   },
  //   notes: String  // Approval notes or rejection reason
  // }]
}, {
  timestamps: true // Adds createdAt and updatedAt automatically
});

// Compound indexes for efficient queries
taskDocumentSchema.index({ taskId: 1, documentType: 1 });
taskDocumentSchema.index({ taskId: 1, reviewStatus: 1 });
taskDocumentSchema.index({ userId: 1, createdAt: -1 });
taskDocumentSchema.index({ status: 1, reviewStatus: 1 });

// Virtual for download URL
taskDocumentSchema.virtual('downloadUrl').get(function() {
  return `/api/task-documents/${this._id}/download`;
});

// Method to mark as deleted (soft delete)
taskDocumentSchema.methods.markAsDeleted = async function(userId) {
  this.status = 'deleted';
  this.deletedAt = new Date();
  this.deletedBy = userId;
  return this.save();
};

// Method to approve document
taskDocumentSchema.methods.approve = async function(userId, notes = '') {
  this.reviewStatus = 'approved';
  this.reviewedBy = userId;
  this.reviewedAt = new Date();
  this.reviewNotes = notes;
  return this.save();
};

// Method to reject document
taskDocumentSchema.methods.reject = async function(userId, reason) {
  this.reviewStatus = 'rejected';
  this.reviewedBy = userId;
  this.reviewedAt = new Date();
  this.reviewNotes = reason;
  return this.save();
};

// Static method to get documents by task
taskDocumentSchema.statics.getByTask = function(taskId) {
  return this.find({
    taskId,
    status: 'active'
  }).sort({ createdAt: -1 });
};

// Static method to get pending documents
taskDocumentSchema.statics.getPendingReview = function(taskId) {
  return this.find({
    taskId,
    status: 'active',
    reviewStatus: 'pending_review'
  });
};

// Static method to check if all required documents are approved
taskDocumentSchema.statics.areAllApproved = async function(taskId, requiredDocTypes) {
  const documents = await this.find({
    taskId,
    status: 'active',
    documentType: { $in: requiredDocTypes }
  });

  // Check if we have at least one document for each required type
  const uploadedTypes = new Set(documents.map(d => d.documentType));
  const allTypesUploaded = requiredDocTypes.every(type => uploadedTypes.has(type));
  
  if (!allTypesUploaded) return false;

  // Check if all documents are approved
  return documents.every(doc => doc.reviewStatus === 'approved');
};

module.exports = mongoose.model('TaskDocument', taskDocumentSchema);
