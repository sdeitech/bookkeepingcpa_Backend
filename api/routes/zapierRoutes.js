const bodyParser = require('body-parser');
const {
  createClientInIgnition,
  testZapierWebhook,
  zapierStatusCallback,
  ignitionProposalStatusCallback,
} = require('../controllers/zapierController');

module.exports = function (app, validator) {
  // Apply body parser for JSON
  const jsonParser = bodyParser.json();

  // Create client in Ignition via Zapier webhook
  // POST /api/integrations/zapier/lead
  app.post('/api/integrations/zapier/lead', jsonParser, createClientInIgnition);

  // Zapier status callback for the first job (creating client/proposal)
  app.post('/api/zapier/status', jsonParser, zapierStatusCallback);

  // NEW: Ignition proposal/payment status callback via Zapier
  // This is what your Ignition Zap should POST to
  app.post(
    '/api/integrations/ignition/proposal-status',
    jsonParser,
    ignitionProposalStatusCallback
  );

  // Test Zapier webhook (development only)
  if (process.env.NODE_ENV !== 'production') {
    app.post('/api/integrations/zapier/test', jsonParser, testZapierWebhook);
  }
};

