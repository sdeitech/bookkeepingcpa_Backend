const taskTemplateController = require('../controllers/taskTemplateController');
const auth = require('../middleware/auth');
const bodyParser = require('body-parser');

module.exports = function (app, validator) {
  const jsonParser = bodyParser.json();
  
  // Get all templates (with filters)
  app.get('/api/task-templates', 
    auth,
    taskTemplateController.getTemplates
  );
  
  // Get single template
  app.get('/api/task-templates/:templateId', 
    auth,
    taskTemplateController.getTemplate
  );
  
  // Create template (Admin and Staff can create)
  app.post('/api/task-templates', 
    jsonParser,
    auth,
    taskTemplateController.createTemplate
  );
  
  // Update template
  app.patch('/api/task-templates/:templateId', 
    jsonParser,
    auth,
    taskTemplateController.updateTemplate
  );
  
  // Delete template (soft delete)
  app.delete('/api/task-templates/:templateId', 
    auth,
    taskTemplateController.deleteTemplate
  );
  
  // Get template usage stats
  app.get('/api/task-templates/:templateId/stats', 
    auth,
    taskTemplateController.getTemplateStats
  );
};
