/**
 * Firebase Realtime Database Service
 * Handles real-time notification signals while keeping MongoDB as the source of truth
 * 
 * Architecture:
 * - MongoDB: Stores full notification data
 * - Firebase: Sends tiny signals for real-time updates
 */

const admin = require('firebase-admin');

class FirebaseRealtimeService {
  constructor() {
    try {
      // Get the existing Firebase admin instance
      this.database = admin.database();
      this.isInitialized = true;
      console.log('✅ Firebase Realtime Database service initialized');
    } catch (error) {
      console.error('⚠️ Firebase Realtime Database not initialized:', error.message);
      this.isInitialized = false;
    }
  }

  /**
   * Emit a notification signal to Firebase for real-time delivery
   * @param {String} userId - The recipient user ID
   * @param {String} notificationId - The MongoDB notification ID
   * @param {String} action - The action type (new, update, delete)
   * @returns {Promise<Boolean>} Success status
   */
  async emitNotificationSignal(userId, notificationId, action = 'new') {
    try {
      if (!this.isInitialized) {
        console.log('Firebase Realtime not available - falling back to polling');
        return false;
      }

      // Convert ObjectIds to strings
      const userIdStr = userId.toString();
      const notificationIdStr = notificationId.toString();

      // Create a minimal signal (not the full notification)
      const signal = {
        id: notificationIdStr,
        timestamp: Date.now(),
        action: action
      };

      // Store signal in Firebase Realtime Database
      const ref = this.database.ref(`notifications/${userIdStr}/${notificationIdStr}`);
      await ref.set(signal);

      // Auto-cleanup: Remove signal after 24 hours to keep Firebase clean
      setTimeout(async () => {
        try {
          await ref.remove();
        } catch (err) {
          // Silent cleanup failure - not critical
        }
      }, 24 * 60 * 60 * 1000);

      console.log(`📡 Real-time signal sent: User ${userIdStr}, Notification ${notificationIdStr}, Action: ${action}`);
      return true;
    } catch (error) {
      console.error('Error emitting notification signal:', error);
      // Don't fail the main operation if real-time fails
      return false;
    }
  }

  /**
   * Emit bulk notification signals for announcements
   * @param {Array} userIds - Array of user IDs
   * @param {String} notificationId - The MongoDB notification ID
   * @returns {Promise<Boolean>} Success status
   */
  async emitBulkSignal(userIds, notificationId) {
    try {
      if (!this.isInitialized) {
        console.log('Firebase Realtime not available - falling back to polling');
        return false;
      }

      const notificationIdStr = notificationId.toString();
      const timestamp = Date.now();
      const updates = {};

      // Prepare batch updates
      userIds.forEach(userId => {
        const userIdStr = userId.toString();
        updates[`notifications/${userIdStr}/${notificationIdStr}`] = {
          id: notificationIdStr,
          timestamp: timestamp,
          action: 'new'
        };
      });

      // Send all signals at once
      await this.database.ref().update(updates);

      console.log(`📡 Bulk signal sent to ${userIds.length} users for notification ${notificationIdStr}`);

      // Auto-cleanup after 24 hours
      setTimeout(async () => {
        try {
          const deleteUpdates = {};
          userIds.forEach(userId => {
            const userIdStr = userId.toString();
            deleteUpdates[`notifications/${userIdStr}/${notificationIdStr}`] = null;
          });
          await this.database.ref().update(deleteUpdates);
        } catch (err) {
          // Silent cleanup failure
        }
      }, 24 * 60 * 60 * 1000);

      return true;
    } catch (error) {
      console.error('Error emitting bulk signals:', error);
      return false;
    }
  }

  /**
   * Mark a notification as read in Firebase
   * @param {String} userId - The user ID
   * @param {String} notificationId - The notification ID
   * @returns {Promise<Boolean>} Success status
   */
  async markAsReadSignal(userId, notificationId) {
    try {
      if (!this.isInitialized) return false;

      const userIdStr = userId.toString();
      const notificationIdStr = notificationId.toString();

      const ref = this.database.ref(`notifications/${userIdStr}/${notificationIdStr}`);
      await ref.update({
        action: 'read',
        timestamp: Date.now()
      });

      // Remove after short delay since it's been read
      setTimeout(async () => {
        try {
          await ref.remove();
        } catch (err) {
          // Silent cleanup
        }
      }, 5000);

      return true;
    } catch (error) {
      console.error('Error marking as read in Firebase:', error);
      return false;
    }
  }

  /**
   * Delete a notification signal from Firebase
   * @param {String} userId - The user ID
   * @param {String} notificationId - The notification ID
   * @returns {Promise<Boolean>} Success status
   */
  async deleteSignal(userId, notificationId) {
    try {
      if (!this.isInitialized) return false;

      const userIdStr = userId.toString();
      const notificationIdStr = notificationId.toString();

      await this.database.ref(`notifications/${userIdStr}/${notificationIdStr}`).remove();
      console.log(`🗑️ Signal removed for user ${userIdStr}, notification ${notificationIdStr}`);
      return true;
    } catch (error) {
      console.error('Error deleting signal:', error);
      return false;
    }
  }

  /**
   * Clear all notification signals for a user
   * @param {String} userId - The user ID
   * @returns {Promise<Boolean>} Success status
   */
  async clearUserSignals(userId) {
    try {
      if (!this.isInitialized) return false;

      const userIdStr = userId.toString();
      await this.database.ref(`notifications/${userIdStr}`).remove();
      console.log(`🧹 All signals cleared for user ${userIdStr}`);
      return true;
    } catch (error) {
      console.error('Error clearing user signals:', error);
      return false;
    }
  }

  /**
   * Get connection status
   * @returns {Boolean} Whether Firebase Realtime is connected
   */
  isConnected() {
    return this.isInitialized;
  }
}

// Export singleton instance
module.exports = new FirebaseRealtimeService();