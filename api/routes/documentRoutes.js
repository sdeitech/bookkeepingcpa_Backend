/* Controller import */
const documentController = require('../controllers/documentController');

/* Services import */
const { upload } = require('../services/documentUpload.service');

/* Middleware import */
const auth = require('../middleware/auth');
const bodyParser = require('body-parser');

module.exports = function (app, validator) {
  // Create JSON parser middleware
  const jsonParser = bodyParser.json();
  
  // Get document categories (static list)
  app.get('/api/documents/categories', auth, documentController.getCategories);
  
  // Upload endpoints
  app.post('/api/documents/upload',
    auth,
    upload.single('document'),
    documentController.uploadDocument
  );
  
  app.post('/api/documents/upload-multiple',
    auth,
    upload.array('documents', 10),
    documentController.uploadMultipleDocuments
  );
  
  // Get documents with filters and pagination
  app.get('/api/documents', auth, documentController.getDocuments);
  
  // Single document operations
  app.get('/api/documents/:documentId', auth, documentController.getDocument);
  app.delete('/api/documents/:documentId', auth, documentController.deleteDocument);
  
  // Download document
  app.get('/api/documents/:documentId/download', auth, documentController.downloadDocument);
}