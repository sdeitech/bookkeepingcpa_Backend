const bodyParser = require('body-parser');
const {
  createClientInIgnition,
  testZapierWebhook
} = require('../controllers/zapierController');

module.exports = function (app, validator) {
  // Apply body parser for JSON
  const jsonParser = bodyParser.json();

  // Create client in Ignition via Zapier webhook
  // POST /api/integrations/zapier/lead
  app.post('/api/integrations/zapier/lead', jsonParser, createClientInIgnition);

  // Test Zapier webhook (development only)
  if (process.env.NODE_ENV !== 'production') {
    app.post('/api/integrations/zapier/test', jsonParser, testZapierWebhook);
  }
};

