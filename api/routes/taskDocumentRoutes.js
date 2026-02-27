const taskDocumentController = require('../controllers/taskDocumentController');
const auth = require('../middleware/auth');
const { authorize } = require('../middleware/auth');
const bodyParser = require('body-parser');

module.exports = function (app, validator) {
  const jsonParser = bodyParser.json();

  // Get documents for a task
  app.get('/api/task-documents/task/:taskId',
    auth,
    taskDocumentController.getTaskDocuments
  );

  app.get('/api/all-task-documents',
    auth,
    taskDocumentController.getAllDocuments
  );


  // Approve document
  app.patch('/api/task-documents/:documentId/approve',
    jsonParser,
    auth,
    // authorize('task', 'approve'),
    taskDocumentController.approveDocument
  );

  // Reject document
  app.patch('/api/task-documents/:documentId/reject',
    jsonParser,
    auth,
    authorize('task', 'reject'),
    taskDocumentController.rejectDocument
  );

  // Download document
  app.get('/api/task-documents/:documentId/download',
    auth,
    taskDocumentController.downloadDocument
  );

  // Delete document
  app.delete('/api/task-documents/:documentId',
    auth,
    authorize('task', 'delete'),
    taskDocumentController.deleteDocument
  );
};
