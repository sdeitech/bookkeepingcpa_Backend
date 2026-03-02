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
    taskDocumentController.approveDocument
  );

  // Reject document
  app.patch('/api/task-documents/:documentId/reject',
    jsonParser,
    auth,
    taskDocumentController.rejectDocument
  );

  // Download document
  app.get('/api/task-documents/:documentId/download',
    auth,
    taskDocumentController.downloadDocument
  );

  // View document (inline display) - auth handled in controller to support query token
  app.get('/api/task-documents/:documentId/view',
    taskDocumentController.viewDocument
  );

  // Delete document
  app.delete('/api/task-documents/:documentId',
    auth,
    taskDocumentController.deleteDocument
  );
};
