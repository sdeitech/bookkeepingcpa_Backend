/**
 * Test Notification Controller
 * API endpoint for testing Firebase real-time notifications
 * Use this with Postman or curl to send notifications to specific users
 */

const Notification = require('../models/notification');
const firebaseRealtimeService = require('../services/firebase.realtime.service');

/**
 * Send a test notification to a specific user
 * POST /api/test/notification
 */
const sendTestNotification = async (req, res) => {
  try {
    const {
      recipientId, // Accept both recipientId and userId for backward compatibility
      userId,
      title,
      message,
      type = 'system',
      priority = 'medium',
      senderId,
      senderName,
      metadata = {}
    } = req.body;

    // Use recipientId if provided, otherwise fall back to userId
    const targetUserId = recipientId || userId;

    // Validate required fields
    if (!targetUserId) {
      return res.status(400).json({
        success: false,
        error: 'recipientId or userId is required'
      });
    }

    if (!title || !message) {
      return res.status(400).json({
        success: false,
        error: 'title and message are required'
      });
    }

    // Create notification in MongoDB with proper schema fields
    const notification = new Notification({
      recipientId: targetUserId,  // Use the resolved user ID
      senderId: senderId || targetUserId,  // Use provided senderId or default to targetUserId for testing
      senderName: senderName || 'System',  // Use provided senderName or default to 'System'
      senderRole: 'system',
      title,
      message,
      type,
      priority,
      isRead: false,
      status: 'sent',
      deliveryStatus: {
        inApp: {
          sent: true,
          sentAt: new Date()
        }
      },
      createdAt: new Date(),
      metadata: {
        ...metadata,
        source: 'test-api',
        timestamp: Date.now(),
        testNotification: true
      }
    });

    const savedNotification = await notification.save();
    console.log('✅ Test notification created in MongoDB:', savedNotification._id);

    // Send Firebase real-time signal with 'new' action
    await firebaseRealtimeService.emitNotificationSignal(
      targetUserId,
      savedNotification._id.toString(),
      'new'  // Changed from priority to 'new' action
    );
    console.log('🔥 Firebase signal sent for user:', targetUserId);

    // Return success response
    res.status(201).json({
      success: true,
      message: 'Test notification sent successfully',
      data: {
        notificationId: savedNotification._id,
        recipientId: targetUserId,
        userId: targetUserId, // Keep for backward compatibility
        title: title,
        message: message,
        type: type,
        priority: priority,
        timestamp: savedNotification.createdAt
      }
    });

  } catch (error) {
    console.error('❌ Error sending test notification:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send test notification',
      details: error.message
    });
  }
};

/**
 * Send bulk test notifications
 * POST /api/test/notifications/bulk
 */
const sendBulkTestNotifications = async (req, res) => {
  try {
    const { userId, count = 5, senderId, senderName } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required'
      });
    }

    const notifications = [];
    const notificationIds = [];

    // Create multiple notifications
    for (let i = 1; i <= count; i++) {
      const notification = new Notification({
        recipientId: userId,  // Changed from userId to recipientId
        senderId: senderId || userId,
        senderName: senderName || 'System',
        senderRole: 'system',
        title: `🧪 Test Notification ${i}`,
        message: `This is test notification #${i} sent at ${new Date().toLocaleTimeString()}`,
        type: 'system',
        priority: i === 1 ? 'high' : 'medium',
        isRead: false,
        status: 'sent',
        deliveryStatus: {
          inApp: {
            sent: true,
            sentAt: new Date()
          }
        },
        createdAt: new Date(),
        metadata: {
          source: 'bulk-test-api',
          index: i,
          totalCount: count,
          testNotification: true
        }
      });

      const saved = await notification.save();
      notifications.push(saved);
      notificationIds.push(saved._id.toString());
    }

    // Send bulk Firebase signals with proper format
    for (const notificationId of notificationIds) {
      await firebaseRealtimeService.emitNotificationSignal(userId, notificationId, 'new');
    }
    console.log(`🔥 Bulk Firebase signals sent: ${count} notifications for user ${userId}`);

    res.status(201).json({
      success: true,
      message: `${count} test notifications sent successfully`,
      data: {
        userId,
        count: notifications.length,
        notifications: notifications.map(n => ({
          id: n._id,
          title: n.title,
          message: n.message,
          priority: n.priority,
          timestamp: n.createdAt
        }))
      }
    });

  } catch (error) {
    console.error('❌ Error sending bulk test notifications:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send bulk test notifications',
      details: error.message
    });
  }
};

/**
 * Mark a notification as read (for testing)
 * PUT /api/test/notification/:notificationId/read
 */
const markNotificationAsRead = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required'
      });
    }

    // Update notification in MongoDB
    const notification = await Notification.findByIdAndUpdate(
      notificationId,
      {
        isRead: true,
        readAt: new Date()
      },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({
        success: false,
        error: 'Notification not found'
      });
    }

    // Send Firebase signal for read status
    await firebaseRealtimeService.markAsReadSignal(userId, notificationId);
    console.log('🔥 Firebase read signal sent for notification:', notificationId);

    res.json({
      success: true,
      message: 'Notification marked as read',
      data: {
        notificationId: notification._id,
        isRead: notification.isRead,
        readAt: notification.readAt
      }
    });

  } catch (error) {
    console.error('❌ Error marking notification as read:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to mark notification as read',
      details: error.message
    });
  }
};

/**
 * Get all notifications for a user (for testing)
 * GET /api/test/notifications/:userId
 */
const getUserNotifications = async (req, res) => {
  try {
    const { userId } = req.params;
    const { unreadOnly = false } = req.query;

    const query = { recipientId: userId };  // Changed from userId to recipientId
    if (unreadOnly === 'true') {
      query.isRead = false;
    }

    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('senderId', 'first_name last_name email');

    res.json({
      success: true,
      data: {
        userId,
        total: notifications.length,
        unreadCount: notifications.filter(n => !n.isRead).length,
        notifications: notifications.map(n => ({
          id: n._id,
          title: n.title,
          message: n.message,
          type: n.type,
          priority: n.priority,
          isRead: n.isRead,
          readAt: n.readAt,
          createdAt: n.createdAt,
          metadata: n.metadata
        }))
      }
    });

  } catch (error) {
    console.error('❌ Error fetching notifications:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch notifications',
      details: error.message
    });
  }
};

module.exports = {
  sendTestNotification,
  sendBulkTestNotifications,
  markNotificationAsRead,
  getUserNotifications
};