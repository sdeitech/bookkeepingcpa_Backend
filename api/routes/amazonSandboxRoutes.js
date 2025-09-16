const express = require('express');
const router = express.Router();
const amazonSandboxController = require('../controllers/amazonSandboxController');
const auth = require('../middleware/auth');
const { validate } = require('../validate-models/amazonValidation');

/**
 * Amazon Sandbox Routes
 * All routes require authentication
 * These routes are for testing/sandbox purposes only
 */

// Initialize sandbox mode with refresh token
router.post(
  '/initialize',
  auth.authenticateToken,
  amazonSandboxController.initializeSandbox
);

// Get sandbox connection status
router.get(
  '/status',
  auth.authenticateToken,
  amazonSandboxController.getSandboxStatus
);

// Reset/clear sandbox configuration
router.delete(
  '/reset',
  auth.authenticateToken,
  amazonSandboxController.resetSandbox
);

// Test sandbox connection
router.get(
  '/test',
  auth.authenticateToken,
  amazonSandboxController.testSandboxConnection
);

// Get orders in sandbox mode
router.get(
  '/orders',
  auth.authenticateToken,
  validate.getOrders,
  amazonSandboxController.getSandboxOrders
);

// Get inventory in sandbox mode
router.get(
  '/inventory',
  auth.authenticateToken,
  validate.getInventory,
  amazonSandboxController.getSandboxInventory
);

module.exports = router;