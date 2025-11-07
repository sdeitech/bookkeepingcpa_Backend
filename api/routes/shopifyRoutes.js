const shopifyController = require('../controllers/shopifyController');
const testShopifyController = require('../controllers/testShopifyController');
const shopifyValidation = require('../validate-models/shopifyValidation');
const authMiddleware = require('../middleware/auth');
const { shopifyAuthMiddleware, shopifyAuthOptional } = require('../middleware/shopifyAuth.middleware');

module.exports = function(app, validator) {
  /**
   * ============================
   * Shopify OAuth Routes
   * ============================
   */
  
  /**
   * Generate OAuth authorization URL
   * GET /api/shopify/auth/authorize
   * Required: User authentication
   * Query: shop (e.g., mystore.myshopify.com)
   * Returns: Authorization URL to redirect user to Shopify
   */
  app.get('/api/shopify/auth/authorize', 
    authMiddleware,
    validator.query(shopifyValidation.authorize),
    shopifyController.getAuthorizationUrl
  );
  
  /**
   * Handle OAuth callback from Shopify
   * GET /api/shopify/auth/callback
   * Note: No auth middleware as this comes from Shopify
   * Query: code, state, shop, hmac, timestamp
   * Redirects to frontend with success/error status
   */
  app.get('/api/shopify/auth/callback',
    validator.query(shopifyValidation.callback),
    shopifyController.handleCallback
  );
  
  /**
   * Get connection status
   * GET /api/shopify/auth/status
   * Required: User authentication
   * Returns: Connection status and store details
   */
  app.get('/api/shopify/auth/status',
    authMiddleware,
    shopifyController.getConnectionStatus
  );
  
  /**
   * Disconnect Shopify store
   * DELETE /api/shopify/auth/disconnect
   * Required: User authentication
   * Removes/deactivates Shopify connection
   */
  app.delete('/api/shopify/auth/disconnect',
    authMiddleware,
    shopifyController.disconnect
  );

  /**
   * ============================
   * Shopify Data Routes
   * ============================
   */
  
  /**
   * Get orders from Shopify
   * GET /api/shopify/orders
   * Required: User authentication + Shopify connection
   * Query params: status?, limit?, createdAfter?, createdBefore?, fields?, page_info?
   * Returns: Array of orders with pagination info
   */
  app.get('/api/shopify/orders',
    authMiddleware,
    shopifyAuthMiddleware,
    validator.query(shopifyValidation.getOrders),
    shopifyController.getOrders
  );

  /**
   * ============================
   * Utility Routes
   * ============================
   */
  
  /**
   * Health check for Shopify integration
   * GET /api/shopify/health
   * Public endpoint to check if Shopify integration is configured
   * Returns: Configuration status and SDK info
   */
  app.get('/api/shopify/health',
    shopifyController.health
  );

  /**
   * Test auth URL generation - for debugging
   * GET /api/shopify/test/auth-url
   * Public endpoint to test auth URL generation
   */
  app.get('/api/shopify/test/auth-url',
    testShopifyController.testAuthUrl
  );

  /**
   * ============================
   * Future Routes (commented out for MVP)
   * ============================
   */
  
  // Products endpoint (future)
  // app.get('/api/shopify/products',
  //   authMiddleware,
  //   shopifyAuthMiddleware,
  //   shopifyController.getProducts
  // );
  
  // Inventory endpoint (future)
  // app.get('/api/shopify/inventory',
  //   authMiddleware,
  //   shopifyAuthMiddleware,
  //   shopifyController.getInventory
  // );
  
  // Customers endpoint (future)
  // app.get('/api/shopify/customers',
  //   authMiddleware,
  //   shopifyAuthMiddleware,
  //   shopifyController.getCustomers
  // );
  
  // Webhook endpoints (future)
  // app.post('/api/shopify/webhooks/orders/create',
  //   shopifyController.handleOrderCreateWebhook
  // );
  
  // app.post('/api/shopify/webhooks/orders/updated',
  //   shopifyController.handleOrderUpdateWebhook
  // );
  
  // Dashboard endpoint (future)
  // app.get('/api/shopify/dashboard',
  //   authMiddleware,
  //   shopifyAuthMiddleware,
  //   shopifyController.getDashboardData
  // );
};