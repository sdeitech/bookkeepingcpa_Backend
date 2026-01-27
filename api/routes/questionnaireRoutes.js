const bodyParser = require('body-parser');
const {
  submitQuestionnaire,
  getQuestionnaireByEmail
} = require('../controllers/questionnaireController');

module.exports = function (app, validator) {
  // Apply body parser for JSON
  const jsonParser = bodyParser.json();

  // Submit questionnaire response (public endpoint - no auth required)
  app.post('/api/questionnaire/submit', jsonParser, submitQuestionnaire);

  // Get questionnaire response by email (public endpoint - for checking existing submissions)
  app.get('/api/questionnaire/:email', getQuestionnaireByEmail);
};

