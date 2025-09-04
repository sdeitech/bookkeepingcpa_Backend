const amazonController = require('../controllers/amazonController');
const amazonSandboxController = require('../controllers/amazonSandboxController');
const amazonValidation = require('../validate-models/amazonValidation');
const authMiddleware = require('../middleware/auth');
const { amazonAuthMiddleware, amazonAuthOptional } = require('../middleware/amazonAuth.middleware');

module.exports = function(app, validator) {
  // ============================
  // OAuth Authentication Routes
  // ============================
  
  /**
   * Generate OAuth authorization URL
   * GET /api/amazon/auth/authorize
   * Required: User authentication
   * Returns: Authorization URL to redirect user to Amazon
   */
  app.get('/api/amazon/auth/authorize', 
    authMiddleware, 
    amazonController.getAuthorizationUrl
  );
  
  /**
   * Handle OAuth callback from Amazon
   * POST /api/amazon/auth/callback
   * Required: User authentication, code and state from Amazon
   * Body: { code, state, error?, error_description? }
   */
  app.post('/api/amazon/auth/callback', 
    authMiddleware,
    validator.body(amazonValidation.callback),
    amazonController.handleCallback
  );
  
  /**
   * Manually refresh access token
   * POST /api/amazon/auth/refresh
   * Required: User authentication, existing Amazon connection
   */
  app.post('/api/amazon/auth/refresh', 
    authMiddleware, 
    amazonController.refreshToken
  );
  
  /**
   * Check Amazon connection status
   * GET /api/amazon/auth/status
   * Required: User authentication
   * Returns: Connection status and seller details
   */
  app.get('/api/amazon/auth/status', 
    authMiddleware, 
    amazonController.getConnectionStatus
  );
  
  /**
   * Disconnect Amazon account
   * DELETE /api/amazon/auth/disconnect
   * Required: User authentication
   * Removes Amazon connection from database
   */
  app.delete('/api/amazon/auth/disconnect', 
    authMiddleware, 
    amazonController.disconnect
  );

  // ============================
  // SP API Data Endpoints
  // ============================
  
  /**
   * Get orders from Amazon
   * GET /api/amazon/orders
   * Required: User authentication, active Amazon connection
   * Query params: marketplaceId?, createdAfter?, createdBefore?, orderStatuses?, maxResults?
   */
  app.get('/api/amazon/orders',
    authMiddleware,
    amazonAuthMiddleware,
    validator.query(amazonValidation.getOrders),
    amazonController.getOrders
  );
  
  /**
   * Get inventory from Amazon
   * GET /api/amazon/inventory
   * Required: User authentication, active Amazon connection
   * Query params: marketplaceId?, skus?
   */
  app.get('/api/amazon/inventory',
    authMiddleware,
    amazonAuthMiddleware,
    validator.query(amazonValidation.getInventory),
    amazonController.getInventory
  );
  
  /**
   * Get financial events from Amazon
   * GET /api/amazon/finance
   * Required: User authentication, active Amazon connection
   * Query params: postedAfter?, postedBefore?, maxResults?
   */
  app.get('/api/amazon/finance',
    authMiddleware,
    amazonAuthMiddleware,
    validator.query(amazonValidation.getFinancialEvents),
    amazonController.getFinancialEvents
  );
  
  /**
   * Create report request
   * POST /api/amazon/reports
   * Required: User authentication, active Amazon connection
   * Body: { reportType, dataStartTime?, dataEndTime? }
   */
  app.post('/api/amazon/reports',
    authMiddleware,
    amazonAuthMiddleware,
    validator.body(amazonValidation.createReport),
    amazonController.createReport
  );
  
  /**
   * Get report document
   * GET /api/amazon/reports/:reportDocumentId
   * Required: User authentication, active Amazon connection
   * Params: reportDocumentId
   */
  app.get('/api/amazon/reports/:reportDocumentId',
    authMiddleware,
    amazonAuthMiddleware,
    amazonController.getReportDocument
  );
  
  /**
   * Get dashboard data (aggregated metrics)
   * GET /api/amazon/dashboard
   * Required: User authentication, active Amazon connection
   * Returns: Seller info, recent orders, inventory summary
   */
  app.get('/api/amazon/dashboard',
    authMiddleware,
    amazonAuthMiddleware,
    amazonController.getDashboardData
  );

  // ============================
  // Public/Info Routes
  // ============================
  
  /**
   * Health check for Amazon integration
   * GET /api/amazon/health
   * Public endpoint to check if Amazon integration is configured
   */
  app.get('/api/amazon/health', (req, res) => {
    const isConfigured = !!(
      process.env.AMAZON_CLIENT_ID && 
      process.env.AMAZON_CLIENT_SECRET &&
      process.env.AMAZON_REDIRECT_URI
    );
    
    res.json({
      success: true,
      message: 'Amazon integration health check',
      data: {
        configured: isConfigured,
        environment: process.env.NODE_ENV,
        timestamp: new Date().toISOString()
      }
    });
  });

  // ============================
  // Sandbox Routes (Testing Only)
  // ============================
  
  /**
   * Initialize sandbox mode with refresh token
   * POST /api/amazon/sandbox/initialize
   * Required: User authentication
   * Body: { refreshToken?, sellerId?, marketplaceIds? }
   * Note: Can use environment variables if not provided in body
   */
  app.post('/api/amazon/sandbox/initialize',
    authMiddleware,
    amazonSandboxController.initializeSandbox
  );
  
  /**
   * Get sandbox connection status
   * GET /api/amazon/sandbox/status
   * Required: User authentication
   * Returns: Sandbox connection status
   */
  app.get('/api/amazon/sandbox/status',
    authMiddleware,
    amazonSandboxController.getSandboxStatus
  );
  
  /**
   * Reset/clear sandbox configuration
   * DELETE /api/amazon/sandbox/reset
   * Required: User authentication
   * Removes sandbox configuration
   */
  app.delete('/api/amazon/sandbox/reset',
    authMiddleware,
    amazonSandboxController.resetSandbox
  );
  
  /**
   * Test sandbox connection
   * GET /api/amazon/sandbox/test
   * Required: User authentication
   * Tests if refresh token is valid
   */
  app.get('/api/amazon/sandbox/test',
    authMiddleware,
    amazonSandboxController.testSandboxConnection
  );
  
  /**
   * Get orders in sandbox mode
   * GET /api/amazon/sandbox/orders
   * Required: User authentication, sandbox initialized
   * Query params: Same as production orders endpoint
   */
  app.get('/api/amazon/sandbox/orders',
    authMiddleware,
    validator.query(amazonValidation.getOrders),
    amazonSandboxController.getSandboxOrders
  );
  
  /**
   * Get inventory in sandbox mode
   * GET /api/amazon/sandbox/inventory
   * Required: User authentication, sandbox initialized
   * Query params: Same as production inventory endpoint
   */
  app.get('/api/amazon/sandbox/inventory',
    authMiddleware,
    validator.query(amazonValidation.getInventory),
    amazonSandboxController.getSandboxInventory
  );
};