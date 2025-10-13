/**
 * Notification Model
 * MongoDB schema for storing notification data
 */

const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  // Firebase reference
  firebaseId: {
    type: String,
    unique: true,
    sparse: true
  },
  
  // Notification content
  type: {
    type: String,
    enum: ['announcement', 'assignment', 'document', 'payment', 'reminder', 'system', 'alert'],
    required: true
  },
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  message: {
    type: String,
    required: true,
    maxlength: 1000
  },
  
  // Recipients
  recipientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },
  recipientRole: {
    type: String,
    enum: ['admin', 'staff', 'client', 'all', null],
    index: true
  },
  recipientEmail: {
    type: String,
    lowercase: true,
    trim: true
  },
  
  // Sender information
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  senderName: {
    type: String,
    required: true
  },
  senderRole: {
    type: String,
    enum: ['admin', 'staff', 'client', 'system']
  },
  
  // Notification properties
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium',
    index: true
  },
  category: {
    type: String,
    enum: ['general', 'task', 'alert', 'update', 'warning'],
    default: 'general'
  },
  
  // Action information
  actionUrl: {
    type: String,
    trim: true
  },
  actionType: {
    type: String,
    enum: ['navigate', 'modal', 'external', 'none'],
    default: 'none'
  },
  actionLabel: {
    type: String,
    default: 'View Details'
  },
  
  // Additional metadata
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  
  // Related entities
  relatedEntities: {
    documentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Document'
    },
    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task'
    },
    paymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Payment'
    },
    assignmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Assignment'
    }
  },
  
  // Read status
  isRead: {
    type: Boolean,
    default: false,
    index: true
  },
  readAt: {
    type: Date,
    default: null
  },
  
  // Delivery status for different channels
  deliveryStatus: {
    push: {
      sent: { type: Boolean, default: false },
      sentAt: Date,
      token: String,
      error: String,
      platform: String
    },
    email: {
      sent: { type: Boolean, default: false },
      sentAt: Date,
      messageId: String,
      error: String
    },
    inApp: {
      sent: { type: Boolean, default: true },
      sentAt: { type: Date, default: Date.now }
    },
    sms: {
      sent: { type: Boolean, default: false },
      sentAt: Date,
      phoneNumber: String,
      messageId: String,
      error: String
    }
  },
  
  // Scheduling
  scheduledFor: {
    type: Date,
    index: true
  },
  
  // Expiration
  expiresAt: {
    type: Date
    // index will be added separately with expireAfterSeconds option
  },
  
  // Status tracking
  status: {
    type: String,
    enum: ['pending', 'sent', 'delivered', 'read', 'failed', 'cancelled', 'archived', 'deleted'],
    default: 'pending',
    index: true
  },
  
  // User interaction
  clickedAt: Date,
  dismissedAt: Date,
  
  // Tags for filtering and searching
  tags: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  
  // Group notifications
  groupId: {
    type: String
    // index will be added separately below
  },
  
  // Retry information
  retryCount: {
    type: Number,
    default: 0
  },
  lastRetryAt: Date,
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  collection: 'notifications'
});

// Indexes for efficient querying
notificationSchema.index({ recipientId: 1, createdAt: -1 });
notificationSchema.index({ recipientId: 1, isRead: 1 });
notificationSchema.index({ recipientRole: 1, createdAt: -1 });
notificationSchema.index({ senderId: 1, createdAt: -1 });
notificationSchema.index({ status: 1, createdAt: -1 });
notificationSchema.index({ type: 1, recipientId: 1 });
notificationSchema.index({ priority: 1, recipientId: 1 });
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
notificationSchema.index({ tags: 1 });
notificationSchema.index({ groupId: 1 });

// Virtual for checking if notification is expired
notificationSchema.virtual('isExpired').get(function() {
  return this.expiresAt && this.expiresAt < new Date();
});

// Virtual for delivery summary
notificationSchema.virtual('deliverySummary').get(function() {
  const channels = ['push', 'email', 'inApp', 'sms'];
  const summary = {};
  
  channels.forEach(channel => {
    if (this.deliveryStatus[channel]) {
      summary[channel] = this.deliveryStatus[channel].sent;
    }
  });
  
  return summary;
});

// Methods

// Mark notification as read
notificationSchema.methods.markAsRead = async function() {
  if (!this.isRead) {
    this.isRead = true;
    this.readAt = new Date();
    this.status = 'read';
    return await this.save();
  }
  return this;
};

// Mark notification as delivered
notificationSchema.methods.markAsDelivered = async function(channel) {
  if (this.deliveryStatus[channel]) {
    this.deliveryStatus[channel].sent = true;
    this.deliveryStatus[channel].sentAt = new Date();
    if (this.status === 'pending') {
      this.status = 'delivered';
    }
    return await this.save();
  }
  return this;
};

// Record delivery error
notificationSchema.methods.recordDeliveryError = async function(channel, error) {
  if (this.deliveryStatus[channel]) {
    this.deliveryStatus[channel].sent = false;
    this.deliveryStatus[channel].error = error.message || error;
    this.retryCount += 1;
    this.lastRetryAt = new Date();
    if (this.retryCount >= 3) {
      this.status = 'failed';
    }
    return await this.save();
  }
  return this;
};

// Statics

// Find notifications for a user
notificationSchema.statics.findForUser = function(userId, options = {}) {
  const query = {
    recipientId: userId,
    status: { $nin: ['deleted', 'archived'] }
  };
  
  if (options.unreadOnly) {
    query.isRead = false;
  }
  
  if (options.type) {
    query.type = options.type;
  }
  
  if (options.priority) {
    query.priority = options.priority;
  }
  
  return this.find(query)
    .sort({ createdAt: -1 })
    .limit(options.limit || 50)
    .populate('senderId', 'first_name last_name email');
};

// Find notifications by role
notificationSchema.statics.findByRole = function(role, options = {}) {
  const query = {
    $or: [
      { recipientRole: role },
      { recipientRole: 'all' }
    ],
    status: { $nin: ['deleted', 'archived'] }
  };
  
  return this.find(query)
    .sort({ createdAt: -1 })
    .limit(options.limit || 50);
};

// Get unread count for a user
notificationSchema.statics.getUnreadCount = function(userId) {
  return this.countDocuments({
    recipientId: userId,
    isRead: false,
    status: { $nin: ['deleted', 'archived'] }
  });
};

// Archive old notifications
notificationSchema.statics.archiveOldNotifications = async function(daysOld = 30) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);
  
  return await this.updateMany(
    {
      createdAt: { $lt: cutoffDate },
      status: { $nin: ['archived', 'deleted'] }
    },
    {
      $set: { status: 'archived' }
    }
  );
};

// Clean up expired notifications
notificationSchema.statics.cleanupExpired = async function() {
  return await this.deleteMany({
    expiresAt: { $lt: new Date() }
  });
};

// Hooks

// Pre-save hook to update timestamps
notificationSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Pre-save hook to set default expiration (7 days for low priority, 30 days for others)
notificationSchema.pre('save', function(next) {
  if (!this.expiresAt && this.isNew) {
    const expirationDays = this.priority === 'low' ? 7 : 30;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expirationDays);
    this.expiresAt = expiresAt;
  }
  next();
});

// Create model
const Notification = mongoose.model('Notification', notificationSchema);

module.exports = Notification;