const taskController = require('../controllers/taskController');
const settingsController = require('../controllers/settingsController');
const auth = require('../middleware/auth');
const { authorize } = require('../middleware/auth');
const {uploadDocument} = require('../services/multer.services');
const bodyParser = require('body-parser');

module.exports = function (app, validator) {
  const jsonParser = bodyParser.json();
  
  // Task routes
  app.post('/api/tasks', 
    jsonParser,
    auth,
    authorize('task', 'create'),
    taskController.createTask
  );

  app.get('/api/tasks', 
    auth, 
    taskController.getTasks
  );

  app.get('/api/tasks/:taskId', 
    auth, 
    authorize('task', 'view'), 
    taskController.getTask
  );

  app.patch('/api/tasks/:taskId', 
    jsonParser,
    auth, 
    authorize('task', 'update'), 
    taskController.updateTask
  );

  app.delete('/api/tasks/:taskId', 
    auth, 
    authorize('task', 'delete'), 
    taskController.deleteTask
  );

  app.patch('/api/tasks/:taskId/status', 
    jsonParser,
    auth, 
    authorize('task', 'updateStatus'), 
    taskController.updateTaskStatus
  );

  app.post('/api/tasks/:taskId/upload', 
    auth, 
    authorize('task', 'upload'),
    uploadDocument.single('file'),
    taskController.uploadDocument
  );

  app.post('/api/tasks/:taskId/approve', 
    jsonParser,
    auth, 
    authorize('task', 'approve'), 
    taskController.approveTask
  );

  app.post('/api/tasks/:taskId/reject', 
    jsonParser,
    auth, 
    authorize('task', 'reject'), 
    taskController.rejectTask
  );

  app.post('/api/tasks/:taskId/help', 
    jsonParser,
    auth, 
    authorize('task', 'help'), 
    taskController.requestHelp
  );

  // Settings routes
  app.get('/api/settings/:key', 
    auth, 
    authorize('settings', 'view'), 
    settingsController.getSetting
  );

  app.put('/api/settings/:key', 
    jsonParser,
    auth, 
    authorize('settings', 'update'), 
    settingsController.updateSetting
  );
};