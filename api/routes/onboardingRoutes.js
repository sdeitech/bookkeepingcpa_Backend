const bodyParser = require('body-parser');
const authMiddleware = require('../middleware/auth');
const {
  getOnboardingStatus,
  getOnboardingData,
  saveOnboardingProgress,
  completeOnboarding,
  validateOnboardingStep,
  deleteOnboardingData
} = require('../controllers/onboardingController');

module.exports = function (app, validator) {
  // Apply body parser for JSON
  const jsonParser = bodyParser.json();

  // All routes require authentication and use JSON body parser
  
  // Get onboarding status for current user
  app.get('/api/onboarding/status', authMiddleware, getOnboardingStatus);

  // Get saved onboarding data
  app.get('/api/onboarding/data', authMiddleware, getOnboardingData);

  // Save onboarding progress
  app.post('/api/onboarding/save-progress', jsonParser, authMiddleware, saveOnboardingProgress);

  // Complete onboarding
  app.post('/api/onboarding/complete', jsonParser, authMiddleware, completeOnboarding);

  // Validate a specific step
  app.post('/api/onboarding/validate-step/:step', jsonParser, authMiddleware, validateOnboardingStep);

  // Delete onboarding data (for testing/admin)
  app.delete('/api/onboarding/reset', authMiddleware, deleteOnboardingData);
};