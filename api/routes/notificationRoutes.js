/**
 * Notification Routes - Robust Implementation
 * Following the established pattern from userRoutes and adminRoutes
 */

const notificationService = require('../services/notificationService');
const Notification = require('../models/notification');
const User = require('../models/userModel');
const auth = require('../middleware/auth');
const bodyParser = require('body-parser');
const Joi = require('joi');

// Validation schemas
const createNotificationSchema = Joi.object({
  type: Joi.string().valid('announcement', 'assignment', 'document', 'payment', 'reminder', 'system', 'alert').required(),
  title: Joi.string().max(200).required(),
  message: Joi.string().max(1000).required(),
  recipientId: Joi.string().optional(),
  recipientRole: Joi.string().valid('admin', 'staff', 'client', 'all').optional(),
  priority: Joi.string().valid('low', 'medium', 'high', 'urgent').default('medium'),
  category: Joi.string().valid('general', 'task', 'alert', 'update', 'warning').default('general'),
  actionUrl: Joi.string().optional(),
  actionType: Joi.string().valid('navigate', 'modal', 'external', 'none').default('none'),
  metadata: Joi.object().optional(),
  channels: Joi.array().items(Joi.string().valid('inApp', 'email', 'sms')).default(['inApp']),
  scheduledFor: Joi.date().optional()
});

const broadcastSchema = Joi.object({
  title: Joi.string().max(200).required(),
  message: Joi.string().max(1000).required(),
  recipientRole: Joi.string().valid('admin', 'staff', 'client', 'all').default('all'),
  priority: Joi.string().valid('low', 'medium', 'high', 'urgent').default('medium'),
  category: Joi.string().valid('general', 'announcement', 'alert', 'update', 'warning').default('announcement'),
  channels: Joi.array().items(Joi.string().valid('inApp', 'email')).default(['inApp']),
  expiresIn: Joi.number().min(1).max(90).optional()
});

const getNotificationsSchema = Joi.object({
  page: Joi.number().min(1).default(1),
  limit: Joi.number().min(1).max(100).default(20),
  unreadOnly: Joi.boolean().default(false),
  type: Joi.string().valid('announcement', 'assignment', 'document', 'payment', 'reminder', 'system', 'alert').optional(),
  priority: Joi.string().valid('low', 'medium', 'high', 'urgent').optional(),
  category: Joi.string().valid('general', 'task', 'alert', 'update', 'warning').optional(),
  lastCheck: Joi.date().optional()
});

const preferencesSchema = Joi.object({
  email: Joi.object({
    announcements: Joi.boolean(),
    assignments: Joi.boolean(),
    documents: Joi.boolean(),
    payments: Joi.boolean(),
    reminders: Joi.boolean(),
    system: Joi.boolean()
  }).optional(),
  inApp: Joi.object({
    all: Joi.boolean()
  }).optional(),
  quiet: Joi.object({
    enabled: Joi.boolean(),
    startTime: Joi.string(),
    endTime: Joi.string()
  }).optional(),
  soundEnabled: Joi.boolean().optional(),
  browserNotifications: Joi.boolean().optional(),
  pollingInterval: Joi.number().min(5000).max(60000).optional()
});

/**
 * Middleware to map userInfo to user for consistency
 * This ensures compatibility with the notification service
 */
const mapUserInfo = (req, res, next) => {
  if (req.userInfo) {
    // Map userInfo to user object with consistent structure
    req.user = {
      _id: req.userInfo.id || req.userInfo._id,
      id: req.userInfo.id || req.userInfo._id,
      email: req.userInfo.email,
      first_name: req.userInfo.first_name,
      last_name: req.userInfo.last_name,
      role: req.userInfo.role_id,
      role_id: req.userInfo.role_id,
      // Add any other fields that might be needed
      ...req.userInfo
    };
  }
  next();
};

/**
 * Enhanced role checking middleware
 * Maps role names to IDs and checks permissions
 */
const checkRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.userInfo || !req.userInfo.role_id) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
        data: null
      });
    }

    // Map role names to IDs
    const roleMap = {
      'admin': '1',
      'staff': '2',
      'client': '3'
    };

    // Convert allowed roles to IDs
    const allowedRoleIds = allowedRoles.map(role => roleMap[role] || role);

    // Check if user's role is allowed
    if (!allowedRoleIds.includes(req.userInfo.role_id)) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions to access this resource',
        data: null
      });
    }

    next();
  };
};

/**
 * Module exports following the established pattern
 */
module.exports = function (app, validator) {
  // Create JSON parser middleware
  const jsonParser = bodyParser.json();

  /**
   * Poll for notification updates (efficient polling endpoint)
   * GET /api/notifications/poll
   */
  app.get('/api/notifications/poll', 
    auth, 
    mapUserInfo,
    async (req, res) => {
      try {
        const lastCheck = req.query.lastCheck || new Date(Date.now() - 60000);
        const updates = await notificationService.getNotificationUpdates(
          req.user._id,
          lastCheck
        );

        res.json({
          success: true,
          data: updates
        });
      } catch (error) {
        console.error('Error polling notifications:', error);
        res.status(500).json({
          success: false,
          message: 'Failed to poll notifications',
          error: error.message
        });
      }
    }
  );

  /**
   * Get notifications for the authenticated user
   * GET /api/notifications
   */
  app.get('/api/notifications',
    auth,
    mapUserInfo,
    validator.query(getNotificationsSchema),
    async (req, res) => {
      try {
        const result = await notificationService.getUserNotifications(
          req.user._id,
          req.query
        );

        res.json({
          success: true,
          data: result
        });
      } catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({
          success: false,
          message: 'Failed to fetch notifications',
          error: error.message
        });
      }
    }
  );

  /**
   * Get unread notification count
   * GET /api/notifications/unread-count
   */
  app.get('/api/notifications/unread-count',
    auth,
    mapUserInfo,
    async (req, res) => {
      try {
        const count = await Notification.getUnreadCount(req.user._id);
        
        res.json({
          success: true,
          data: { count }
        });
      } catch (error) {
        console.error('Error getting unread count:', error);
        res.status(500).json({
          success: false,
          message: 'Failed to get unread count',
          error: error.message
        });
      }
    }
  );

  /**
   * Get notification preferences
   * GET /api/notifications/preferences
   */
  app.get('/api/notifications/preferences',
    auth,
    mapUserInfo,
    async (req, res) => {
      try {
        const user = await User.findById(req.user._id).select('notificationPreferences');
        
        const defaultPreferences = {
          email: {
            announcements: true,
            assignments: true,
            documents: true,
            payments: true,
            reminders: true,
            system: true
          },
          inApp: {
            all: true
          },
          quiet: {
            enabled: false,
            startTime: '22:00',
            endTime: '08:00'
          },
          soundEnabled: true,
          browserNotifications: false,
          pollingInterval: 10000
        };
        
        const preferences = user?.notificationPreferences || defaultPreferences;
        
        res.json({
          success: true,
          data: preferences
        });
      } catch (error) {
        console.error('Error fetching preferences:', error);
        res.status(500).json({
          success: false,
          message: 'Failed to fetch preferences',
          error: error.message
        });
      }
    }
  );

  /**
   * Get notification statistics (admin only)
   * GET /api/notifications/stats
   */
  app.get('/api/notifications/stats',
    auth,
    checkRole(['admin']),
    mapUserInfo,
    async (req, res) => {
      try {
        const stats = await Notification.aggregate([
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              read: { $sum: { $cond: ['$isRead', 1, 0] } },
              unread: { $sum: { $cond: ['$isRead', 0, 1] } },
              byType: { $push: '$type' },
              byPriority: { $push: '$priority' },
              byStatus: { $push: '$status' }
            }
          },
          {
            $project: {
              _id: 0,
              total: 1,
              read: 1,
              unread: 1,
              readRate: {
                $multiply: [
                  { $divide: ['$read', '$total'] },
                  100
                ]
              }
            }
          }
        ]);
        
        res.json({
          success: true,
          data: stats[0] || {
            total: 0,
            read: 0,
            unread: 0,
            readRate: 0
          }
        });
      } catch (error) {
        console.error('Error fetching statistics:', error);
        res.status(500).json({
          success: false,
          message: 'Failed to fetch statistics',
          error: error.message
        });
      }
    }
  );

  /**
   * Get a specific notification by ID with unread count
   * GET /api/notifications/:id
   */
  app.get('/api/notifications/:id',
    auth,
    mapUserInfo,
    async (req, res) => {
      try {
        const notification = await Notification.findOne({
          _id: req.params.id,
          recipientId: req.user._id
        });

        if (!notification) {
          return res.status(404).json({
            success: false,
            message: 'Notification not found'
          });
        }

        // Get unread count for the user
        const unreadCount = await Notification.getUnreadCount(req.user._id);

        res.json({
          success: true,
          data: {
            notification: notification,
            unreadCount: unreadCount
          }
        });
      } catch (error) {
        console.error('Error fetching notification:', error);
        res.status(500).json({
          success: false,
          message: 'Failed to fetch notification',
          error: error.message
        });
      }
    }
  );

  /**
   * Create a new notification
   * POST /api/notifications
   */
  app.post('/api/notifications',
    jsonParser,
    auth,
    checkRole(['admin', 'staff']),
    mapUserInfo,
    validator.body(createNotificationSchema),
    async (req, res) => {
      try {
        const notificationData = {
          ...req.body,
          senderId: req.user._id,
          senderName: `${req.user.first_name} ${req.user.last_name}`,
          senderRole: req.user.role_id
        };

        const notification = await notificationService.createNotification(notificationData);
        
        res.status(201).json({
          success: true,
          message: 'Notification created successfully',
          data: notification
        });
      } catch (error) {
        console.error('Error creating notification:', error);
        res.status(500).json({
          success: false,
          message: 'Failed to create notification',
          error: error.message
        });
      }
    }
  );

  /**
   * Broadcast notification to multiple users
   * POST /api/notifications/broadcast
   */
  app.post('/api/notifications/broadcast',
    jsonParser,
    auth,
    checkRole(['admin']),
    mapUserInfo,
    validator.body(broadcastSchema),
    async (req, res) => {
      try {
        const broadcastData = {
          ...req.body,
          senderId: req.user._id,
          senderName: `${req.user.first_name} ${req.user.last_name}`
        };

        if (req.body.expiresIn) {
          const expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + req.body.expiresIn);
          broadcastData.expiresAt = expiresAt;
        }

        const notifications = await notificationService.broadcastNotification(broadcastData);
        
        res.status(201).json({
          success: true,
          message: `Broadcast sent to ${notifications.length} users`,
          data: {
            count: notifications.length,
            sample: notifications.slice(0, 5)
          }
        });
      } catch (error) {
        console.error('Error broadcasting notification:', error);
        res.status(500).json({
          success: false,
          message: 'Failed to broadcast notification',
          error: error.message
        });
      }
    }
  );

  /**
   * Test notification endpoint (for development)
   * POST /api/notifications/test
   */
  app.post('/api/notifications/test',
    jsonParser,
    auth,
    checkRole(['admin']),
    mapUserInfo,
    async (req, res) => {
      try {
        const testNotification = {
          type: 'system',
          title: 'Test Notification',
          message: `This is a test notification sent at ${new Date().toLocaleString()}`,
          recipientId: req.user._id,
          senderId: req.user._id,
          senderName: 'System',
          priority: 'low',
          category: 'general',
          channels: req.body.channels || ['inApp'],
          metadata: {
            test: true,
            timestamp: Date.now()
          }
        };

        const notification = await notificationService.createNotification(testNotification);
        
        res.json({
          success: true,
          message: 'Test notification sent',
          data: notification
        });
      } catch (error) {
        console.error('Error sending test notification:', error);
        res.status(500).json({
          success: false,
          message: 'Failed to send test notification',
          error: error.message
        });
      }
    }
  );

  /**
   * Mark a notification as read
   * PUT /api/notifications/:id/read
   */
  app.put('/api/notifications/:id/read',
    jsonParser,
    auth,
    mapUserInfo,
    async (req, res) => {
      try {
        const notification = await notificationService.markAsRead(
          req.params.id,
          req.user._id
        );
        
        res.json({
          success: true,
          message: 'Notification marked as read',
          data: notification
        });
      } catch (error) {
        console.error('Error marking notification as read:', error);
        res.status(500).json({
          success: false,
          message: 'Failed to mark notification as read',
          error: error.message
        });
      }
    }
  );

  /**
   * Mark all notifications as read
   * PUT /api/notifications/read-all
   */
  app.put('/api/notifications/read-all',
    jsonParser,
    auth,
    mapUserInfo,
    async (req, res) => {
      try {
        const result = await notificationService.markAllAsRead(req.user._id);
        
        res.json({
          success: true,
          message: 'All notifications marked as read',
          data: result
        });
      } catch (error) {
        console.error('Error marking all as read:', error);
        res.status(500).json({
          success: false,
          message: 'Failed to mark all as read',
          error: error.message
        });
      }
    }
  );

  /**
   * Update notification preferences
   * PUT /api/notifications/preferences
   */
  app.put('/api/notifications/preferences',
    jsonParser,
    auth,
    mapUserInfo,
    validator.body(preferencesSchema),
    async (req, res) => {
      try {
        const user = await User.findByIdAndUpdate(
          req.user._id,
          { $set: { notificationPreferences: req.body } },
          { new: true }
        ).select('notificationPreferences');
        
        res.json({
          success: true,
          message: 'Preferences updated successfully',
          data: user.notificationPreferences
        });
      } catch (error) {
        console.error('Error updating preferences:', error);
        res.status(500).json({
          success: false,
          message: 'Failed to update preferences',
          error: error.message
        });
      }
    }
  );

  /**
   * Delete a notification
   * DELETE /api/notifications/:id
   */
  app.delete('/api/notifications/:id',
    auth,
    mapUserInfo,
    async (req, res) => {
      try {
        const notification = await notificationService.deleteNotification(
          req.params.id,
          req.user._id
        );
        
        res.json({
          success: true,
          message: 'Notification deleted successfully',
          data: notification
        });
      } catch (error) {
        console.error('Error deleting notification:', error);
        res.status(500).json({
          success: false,
          message: 'Failed to delete notification',
          error: error.message
        });
      }
    }
  );

  console.log('✅ Notification routes registered successfully');
};