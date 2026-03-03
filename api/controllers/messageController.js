const Message = require('../models/messageModel');
const Task = require('../models/taskModel');
const User = require('../models/userModel');
const notificationHelper = require('../helpers/notificationHelper');
const firebaseRealtime = require('../services/firebase.realtime.service');

/**
 * Send a message on a task
 * POST /api/tasks/:taskId/messages
 */
exports.sendMessage = async (req, res) => {
  try {
    const { taskId } = req.params;
    const { message } = req.body;
    const userId = req.user._id;

    // Validate message
    if (!message || message.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Message cannot be empty'
      });
    }

    if (message.length > 2000) {
      return res.status(400).json({
        success: false,
        message: 'Message too long (max 2000 characters)'
      });
    }

    // Check if task exists
    const task = await Task.findById(taskId)
      .populate('clientId', 'first_name last_name email role_id')
      .populate('staffId', 'first_name last_name email role_id');

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }

    // Permissions inherited from task view - no additional checks needed
    // If user can view the task, they can send messages

    // Get sender info
    const sender = await User.findById(userId).select('first_name last_name role_id');
    
    // Map role_id to role name
    const roleMap = {
      '1': 'admin',
      '2': 'staff',
      '3': 'client'
    };

    // Create message
    const newMessage = await Message.create({
      taskId,
      senderId: userId,
      senderName: `${sender.first_name} ${sender.last_name}`,
      senderRole: roleMap[sender.role_id] || 'client',
      message: message.trim()
    });

    // Populate sender for response
    await newMessage.populate('senderId', 'first_name last_name role_id');

    // Emit Firebase real-time signal for instant message delivery
    try {
      await firebaseRealtime.emitNotificationSignal(
        taskId,
        newMessage._id,
        'new_message'
      );
      console.log(`📨 Real-time message signal sent for task ${taskId}`);
    } catch (firebaseError) {
      console.error('Error emitting message signal:', firebaseError);
      // Don't fail the request if Firebase fails - polling fallback will work
    }

    // Send notification to the other person (not sender)
    try {
      // Determine the other participant
      let recipient = null;
      
      // If sender is client, notify staff
      if (sender.role_id === '3' && task.staffId) {
        recipient = task.staffId;
      }
      // If sender is staff or admin, notify client
      else if ((sender.role_id === '2' || sender.role_id === '1') && task.clientId) {
        recipient = task.clientId;
      }

      // Send notification if recipient exists
      if (recipient) {
        await notificationHelper.notifyNewMessage(task, newMessage, sender, recipient);
      }
    } catch (notifError) {
      console.error('Error sending message notification:', notifError);
      // Don't fail the request if notification fails
    }

    return res.status(201).json({
      success: true,
      message: 'Message sent successfully',
      data: newMessage
    });
  } catch (error) {
    console.error('Send message error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to send message',
      error: error.message
    });
  }
};

/**
 * Get messages for a task
 * GET /api/tasks/:taskId/messages
 * Query params: page (default 1), limit (default 10)
 */
exports.getTaskMessages = async (req, res) => {
  try {
    const { taskId } = req.params;
    const { page = 1, limit = 10 } = req.query;
    const userId = req.user._id;

    // Check if task exists
    const task = await Task.findById(taskId);

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }

    // Permissions inherited from task view - no additional checks needed

    // Get total count
    const totalMessages = await Message.countDocuments({ taskId });

    // Get messages - LATEST FIRST (newest at top, like Jira)
    const messages = await Message.find({ taskId })
      .sort({ createdAt: -1 }) // Latest first
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .populate('senderId', 'first_name last_name role_id');

    // Check if there are more messages to load
    const hasMore = totalMessages > (parseInt(page) * parseInt(limit));

    return res.status(200).json({
      success: true,
      data: {
        messages,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: totalMessages,
          pages: Math.ceil(totalMessages / parseInt(limit)),
          hasMore
        }
      }
    });
  } catch (error) {
    console.error('Get task messages error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get messages',
      error: error.message
    });
  }
};

/**
 * Get unread message count for current user
 * GET /api/messages/unread-count
 */
exports.getUnreadCount = async (req, res) => {
  try {
    const userId = req.user._id;

    const unreadCount = await Message.getUnreadCountForUser(userId);
    const unreadPerTask = await Message.getUnreadCountPerTask(userId);

    return res.status(200).json({
      success: true,
      data: {
        total: unreadCount,
        perTask: unreadPerTask
      }
    });
  } catch (error) {
    console.error('Get unread count error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get unread count',
      error: error.message
    });
  }
};

/**
 * Mark all messages in a task as read for current user
 * PATCH /api/tasks/:taskId/messages/mark-read
 */
exports.markTaskMessagesAsRead = async (req, res) => {
  try {
    const { taskId } = req.params;
    const userId = req.user._id;

    // Check if task exists
    const task = await Task.findById(taskId);

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }

    // Mark all unread messages in this task as read
    const result = await Message.markTaskMessagesAsRead(taskId, userId);

    return res.status(200).json({
      success: true,
      message: 'Messages marked as read',
      data: {
        markedCount: result.modifiedCount
      }
    });
  } catch (error) {
    console.error('Mark messages as read error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to mark messages as read',
      error: error.message
    });
  }
};
