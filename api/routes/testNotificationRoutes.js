/**
 * Test Notification Routes
 * Routes for testing Firebase real-time notifications
 */

const express = require('express');
const bodyParser = require('body-parser');
const testNotificationController = require('../controllers/testNotificationController');

module.exports = function(app, validator) {
    // Apply JSON body parser for test routes
    app.use('/api/test', bodyParser.json());
    
    // Send single test notification
    app.post('/api/test/notification', testNotificationController.sendTestNotification);
    
    // Send bulk test notifications
    app.post('/api/test/notifications/bulk', testNotificationController.sendBulkTestNotifications);
    
    // Mark notification as read
    app.put('/api/test/notification/:notificationId/read', testNotificationController.markNotificationAsRead);
    
    // Get user notifications
    app.get('/api/test/notifications/:userId', testNotificationController.getUserNotifications);
    
    console.log('✅ Test notification routes registered at /api/test/*');
};