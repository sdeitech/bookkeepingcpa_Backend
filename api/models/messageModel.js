const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  taskId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Task',
    required: true,
    index: true
  },
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  senderName: {
    type: String,
    required: true
  },
  senderRole: {
    type: String,
    enum: ['admin', 'staff', 'client'],
    required: true
  },
  message: {
    type: String,
    required: true,
    trim: true,
    maxlength: 2000
  },
  isRead: {
    type: Boolean,
    default: false
  },
  readBy: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    readAt: {
      type: Date,
      default: Date.now
    }
  }],
  // Future expansion fields (commented out for now)
  // contextType: String,        // 'task', 'quickbooks', 'direct_message'
  // contextId: String,          // For non-task contexts
  // attachments: [],            // For future file attachments
  // reactions: [],              // For future reactions
}, {
  timestamps: true
});

// Indexes for performance
messageSchema.index({ taskId: 1, createdAt: -1 });
messageSchema.index({ senderId: 1, createdAt: -1 });
messageSchema.index({ taskId: 1, isRead: 1 });

/**
 * Get unread message count for a user across all their tasks
 * @param {ObjectId} userId - User ID
 * @returns {Number} Unread count
 */
messageSchema.statics.getUnreadCountForUser = async function(userId) {
  const Task = mongoose.model('Task');
  
  // Get all tasks where user is involved
  const tasks = await Task.find({
    $or: [
      { clientId: userId },
      { staffId: userId },
      { createdBy: userId }
    ]
  }).select('_id');
  
  const taskIds = tasks.map(t => t._id);
  
  // Count unread messages in those tasks (not sent by user)
  return await this.countDocuments({
    taskId: { $in: taskIds },
    senderId: { $ne: userId },
    isRead: false
  });
};

/**
 * Get unread message count per task for a user
 * @param {ObjectId} userId - User ID
 * @returns {Object} Object with taskId as key and count as value
 */
messageSchema.statics.getUnreadCountPerTask = async function(userId) {
  const Task = mongoose.model('Task');
  
  // Get all tasks where user is involved
  const tasks = await Task.find({
    $or: [
      { clientId: userId },
      { staffId: userId },
      { createdBy: userId }
    ]
  }).select('_id');
  
  const taskIds = tasks.map(t => t._id);
  
  // Aggregate unread counts by task
  const unreadCounts = await this.aggregate([
    {
      $match: {
        taskId: { $in: taskIds },
        senderId: { $ne: userId },
        isRead: false
      }
    },
    {
      $group: {
        _id: '$taskId',
        count: { $sum: 1 }
      }
    }
  ]);
  
  // Convert to object: { taskId: count }
  return unreadCounts.reduce((acc, item) => {
    acc[item._id.toString()] = item.count;
    return acc;
  }, {});
};

/**
 * Mark all messages in a task as read for a user
 * @param {ObjectId} taskId - Task ID
 * @param {ObjectId} userId - User ID
 */
messageSchema.statics.markTaskMessagesAsRead = async function(taskId, userId) {
  return await this.updateMany(
    {
      taskId,
      senderId: { $ne: userId },
      isRead: false
    },
    {
      $set: { isRead: true },
      $push: {
        readBy: {
          userId,
          readAt: new Date()
        }
      }
    }
  );
};

module.exports = mongoose.model('Message', messageSchema);
