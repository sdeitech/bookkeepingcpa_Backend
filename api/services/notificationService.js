/**
 * Notification Service - MongoDB + Firebase Realtime Hybrid
 * MongoDB: Stores full notification data (source of truth)
 * Firebase: Sends real-time signals for instant delivery
 */

const Notification = require('../models/notification');
const nodemailer = require('nodemailer');
const firebaseRealtime = require('./firebase.realtime.service');

class NotificationService {
  constructor() {
    // Initialize email transporter if needed
    this.emailTransporter = null;
    this.initializeEmailTransporter();
  }

  /**
   * Initialize email transporter for email notifications
   */
  initializeEmailTransporter() {
    if (process.env.SMTP_HOST) {
      this.emailTransporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT || 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      });
    }
  }

  /**
   * Create and send a notification
   * @param {Object} notificationData - Notification details
   * @returns {Promise<Object>} Created notification
   */
  async createNotification(notificationData) {
    try {
      const {
        type,
        title,
        message,
        recipientId,
        recipientRole,
        senderId,
        senderName,
        priority = 'medium',
        category = 'general',
        actionUrl,
        actionType = 'none',
        metadata = {},
        channels = ['inApp'],
        scheduledFor = null
      } = notificationData;

      // Create notification in MongoDB
      const notification = new Notification({
        type,
        title,
        message,
        recipientId,
        recipientRole,
        senderId,
        senderName,
        priority,
        category,
        actionUrl,
        actionType,
        metadata,
        scheduledFor,
        status: scheduledFor ? 'pending' : 'sent'
      });

      await notification.save();

      // Emit Firebase real-time signal for instant delivery
      await firebaseRealtime.emitNotificationSignal(
        recipientId,
        notification._id,
        'new'
      );

      // If not scheduled, send immediately through requested channels
      if (!scheduledFor) {
        if (channels.includes('email')) {
          await this.sendEmailNotification(notification);
        }
        
        // In-app notifications are automatically available through polling
        notification.deliveryStatus.inApp.sent = true;
        notification.deliveryStatus.inApp.sentAt = new Date();
        await notification.save();
      }

      return notification;
    } catch (error) {
      console.error('Error creating notification:', error);
      throw error;
    }
  }

  /**
   * Send email notification
   * @param {Object} notification - Notification document
   */
  async sendEmailNotification(notification) {
    try {
      if (!this.emailTransporter) {
        console.log('Email transporter not configured');
        return;
      }

      // Get user email
      const User = require('../models/user');
      const user = await User.findById(notification.recipientId);
      
      if (!user || !user.email) {
        console.log('User email not found');
        return;
      }

      const mailOptions = {
        from: process.env.SMTP_FROM || 'noreply@plurify.com',
        to: user.email,
        subject: notification.title,
        html: this.generateEmailTemplate(notification),
        text: notification.message
      };

      const info = await this.emailTransporter.sendMail(mailOptions);
      
      console.log('Email notification sent:', info.messageId);
      
      // Update delivery status
      notification.deliveryStatus.email.sent = true;
      notification.deliveryStatus.email.sentAt = new Date();
      notification.deliveryStatus.email.messageId = info.messageId;
      await notification.save();
    } catch (error) {
      console.error('Error sending email notification:', error);
      await notification.recordDeliveryError('email', error);
    }
  }

  /**
   * Generate email template
   * @param {Object} notification - Notification document
   */
  generateEmailTemplate(notification) {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #007bff; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background-color: #f8f9fa; }
            .footer { padding: 20px; text-align: center; color: #6c757d; }
            .button { 
              display: inline-block; 
              padding: 10px 20px; 
              background-color: #007bff; 
              color: white; 
              text-decoration: none; 
              border-radius: 5px; 
              margin-top: 15px;
            }
            .priority-urgent { border-left: 5px solid #dc3545; }
            .priority-high { border-left: 5px solid #ffc107; }
            .priority-medium { border-left: 5px solid #28a745; }
            .priority-low { border-left: 5px solid #6c757d; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Plurify Notification</h1>
            </div>
            <div class="content priority-${notification.priority}">
              <h2>${notification.title}</h2>
              <p>${notification.message}</p>
              ${notification.actionUrl ? `
                <a href="${process.env.FRONTEND_URL}${notification.actionUrl}" class="button">
                  View Details
                </a>
              ` : ''}
            </div>
            <div class="footer">
              <p>This is an automated message from Plurify. Please do not reply to this email.</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  /**
   * Broadcast notification to multiple users
   * @param {Object} broadcastData - Broadcast details
   */
  async broadcastNotification(broadcastData) {
    try {
      const {
        title,
        message,
        recipientRole = 'all',
        senderId,
        senderName,
        priority = 'medium',
        category = 'announcement',
        channels = ['inApp']
      } = broadcastData;

      // Get all target users
      const User = require('../models/user');
      let query = {};
      
      if (recipientRole !== 'all') {
        query.role = recipientRole;
      }
      
      const users = await User.find(query).select('_id');
      
      const notifications = [];
      
      // Create notifications for each user
      for (const user of users) {
        const notification = await this.createNotification({
          type: 'announcement',
          title,
          message,
          recipientId: user._id,
          recipientRole,
          senderId,
          senderName,
          priority,
          category,
          channels
        });
        notifications.push(notification);
      }

      // Emit bulk Firebase signals for real-time delivery
      if (notifications.length > 0) {
        const userIds = users.map(u => u._id);
        await firebaseRealtime.emitBulkSignal(userIds, notifications[0]._id);
      }
      
      console.log(`Broadcast sent to ${notifications.length} users`);
      return notifications;
    } catch (error) {
      console.error('Error broadcasting notification:', error);
      throw error;
    }
  }

  /**
   * Mark notification as read
   * @param {String} notificationId - Notification ID
   * @param {String} userId - User ID
   */
  async markAsRead(notificationId, userId) {
    try {
      const notification = await Notification.findOne({
        _id: notificationId,
        recipientId: userId
      });
      
      if (!notification) {
        throw new Error('Notification not found');
      }
      
      await notification.markAsRead();
      
      // Emit Firebase signal for read status
      await firebaseRealtime.markAsReadSignal(userId, notificationId);
      
      return notification;
    } catch (error) {
      console.error('Error marking notification as read:', error);
      throw error;
    }
  }

  /**
   * Mark all notifications as read for a user
   * @param {String} userId - User ID
   */
  async markAllAsRead(userId) {
    try {
      const result = await Notification.updateMany(
        { recipientId: userId, isRead: false },
        { 
          $set: { 
            isRead: true, 
            readAt: new Date(),
            status: 'read'
          }
        }
      );
      
      // Clear all Firebase signals for this user
      await firebaseRealtime.clearUserSignals(userId);
      
      return result;
    } catch (error) {
      console.error('Error marking all as read:', error);
      throw error;
    }
  }

  /**
   * Delete a notification
   * @param {String} notificationId - Notification ID
   * @param {String} userId - User ID
   */
  async deleteNotification(notificationId, userId) {
    try {
      const notification = await Notification.findOneAndUpdate(
        { _id: notificationId, recipientId: userId },
        { $set: { status: 'deleted' } },
        { new: true }
      );
      
      if (!notification) {
        throw new Error('Notification not found');
      }
      
      // Remove Firebase signal
      await firebaseRealtime.deleteSignal(userId, notificationId);
      
      return notification;
    } catch (error) {
      console.error('Error deleting notification:', error);
      throw error;
    }
  }

  /**
   * Get notifications for a user with smart update detection
   * @param {String} userId - User ID
   * @param {Object} options - Query options
   */
  async getUserNotifications(userId, options = {}) {
    try {
      const {
        page = 1,
        limit = 20,
        unreadOnly = false,
        type = null,
        priority = null,
        category = null,
        lastCheck = null
      } = options;

      const query = {
        recipientId: userId,
        status: { $nin: ['deleted'] }
      };

      if (unreadOnly) query.isRead = false;
      if (type) query.type = type;
      if (priority) query.priority = priority;
      if (category) query.category = category;

      const notifications = await Notification
        .find(query)
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip((page - 1) * limit)
        .populate('senderId', 'first_name last_name email');

      const total = await Notification.countDocuments(query);
      const unreadCount = await Notification.getUnreadCount(userId);

      // Check if there are new notifications since last check
      let hasNewNotifications = false;
      if (lastCheck) {
        const newNotificationsCount = await Notification.countDocuments({
          ...query,
          createdAt: { $gt: new Date(lastCheck) }
        });
        hasNewNotifications = newNotificationsCount > 0;
      }

      return {
        notifications,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        },
        unreadCount,
        hasNewNotifications,
        lastCheck: new Date()
      };
    } catch (error) {
      console.error('Error getting user notifications:', error);
      throw error;
    }
  }

  /**
   * Get notification updates (for efficient polling)
   * Returns only the changes since last check
   */
  async getNotificationUpdates(userId, lastCheck) {
    try {
      const query = {
        recipientId: userId,
        status: { $nin: ['deleted'] }
      };

      // Get new notifications
      const newNotifications = await Notification
        .find({
          ...query,
          createdAt: { $gt: new Date(lastCheck) }
        })
        .sort({ createdAt: -1 })
        .populate('senderId', 'first_name last_name email');

      // Get updated notifications (read status changed)
      const updatedNotifications = await Notification
        .find({
          ...query,
          updatedAt: { $gt: new Date(lastCheck) },
          createdAt: { $lte: new Date(lastCheck) }
        })
        .select('_id isRead readAt status')
        .lean();

      const unreadCount = await Notification.getUnreadCount(userId);

      return {
        newNotifications,
        updatedNotifications,
        unreadCount,
        timestamp: new Date()
      };
    } catch (error) {
      console.error('Error getting notification updates:', error);
      throw error;
    }
  }

  /**
   * Process scheduled notifications
   * This should be called by a cron job
   */
  async processScheduledNotifications() {
    try {
      const now = new Date();
      const notifications = await Notification.find({
        scheduledFor: { $lte: now },
        status: 'pending'
      });

      for (const notification of notifications) {
        if (notification.deliveryStatus.email.sent === false) {
          await this.sendEmailNotification(notification);
        }
        
        notification.status = 'sent';
        notification.deliveryStatus.inApp.sent = true;
        notification.deliveryStatus.inApp.sentAt = new Date();
        await notification.save();
      }

      console.log(`Processed ${notifications.length} scheduled notifications`);
    } catch (error) {
      console.error('Error processing scheduled notifications:', error);
    }
  }

  /**
   * Clean up old notifications
   * This should be called by a cron job
   */
  async cleanupNotifications() {
    try {
      // Archive old notifications
      const archived = await Notification.archiveOldNotifications(30);
      console.log('Archived notifications:', archived.modifiedCount);
      
      // Delete expired notifications
      const deleted = await Notification.cleanupExpired();
      console.log('Deleted expired notifications:', deleted.deletedCount);
    } catch (error) {
      console.error('Error cleaning up notifications:', error);
    }
  }
}

// Export singleton instance
module.exports = new NotificationService();