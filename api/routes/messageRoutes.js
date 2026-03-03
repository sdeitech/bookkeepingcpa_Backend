const auth = require('../middleware/auth');
const messageController = require('../controllers/messageController');
const bodyParser = require('body-parser');

module.exports = function (app, validator) {
  const jsonParser = bodyParser.json();
   
  /**
   * Send a message on a task
   * POST /api/tasks/:taskId/messages
   */
  app.post(
    '/api/tasks/:taskId/messages',
    jsonParser,
    auth,
    messageController.sendMessage
  );

  /**
   * Get messages for a task
   * GET /api/tasks/:taskId/messages
   * Query params: page, limit
   */
  app.get(
    '/api/tasks/:taskId/messages',
    auth,
    messageController.getTaskMessages
  );

  /**
   * Get unread message count for current user
   * GET /api/messages/unread-count
   */
  app.get(
    '/api/messages/unread-count',
    auth,
    messageController.getUnreadCount
  );

  /**
   * Mark messages as read for a task
   * PATCH /api/tasks/:taskId/messages/mark-read
   */
  app.patch(
    '/api/tasks/:taskId/messages/mark-read',
    auth,
    messageController.markTaskMessagesAsRead
  );

  console.log('✅ Message routes registered successfully');
};
