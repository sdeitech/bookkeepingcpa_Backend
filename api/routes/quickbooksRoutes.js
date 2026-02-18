const quickbooksController = require('../controllers/quickbooksController');
const quickbooksValidation = require('../validate-models/quickbooksValidation');
const authMiddleware = require('../middleware/auth');
const { quickbooksAuthMiddleware, quickbooksAuthOptional,ensureValidQuickBooksToken } = require('../middleware/quickbooksAuth.middleware');

module.exports = (app, validator) => {
  /**
   * ==========================================
   * AUTHENTICATION ENDPOINTS
   * ==========================================
   */

  /**
   * Generate OAuth authorization URL
   * GET /api/quickbooks/auth/authorize
   * Required: User authentication
   * Returns: Authorization URL to redirect user to QuickBooks
   */
  app.get('/api/quickbooks/auth/authorize',
    authMiddleware,
    quickbooksController.getAuthorizationUrl
  );

  /**
   * Handle OAuth callback from QuickBooks
   * GET /api/quickbooks/auth/callback
   * Note: No auth middleware as this comes from QuickBooks
   * Query params: code, state, realmId, error (optional)
   */
  app.get('/api/quickbooks/auth/callback',
    validator.query(quickbooksValidation.callback),
    quickbooksController.handleCallback
  );

  /**
   * Manually refresh access token
   * POST /api/quickbooks/auth/refresh
   * Required: User authentication, existing QuickBooks connection
   */
  app.post('/api/quickbooks/auth/refresh',
    authMiddleware,
    quickbooksController.refreshToken
  );

  /**
   * Check QuickBooks connection status
   * GET /api/quickbooks/auth/status
   * Required: User authentication
   * Returns: Connection status and company details
   */
  app.get('/api/quickbooks/auth/status',
    authMiddleware,
    quickbooksController.getConnectionStatus
  );

  /**
   * Disconnect QuickBooks account
   * DELETE /api/quickbooks/auth/disconnect
   * Required: User authentication
   * Revokes tokens and removes connection
   */
  app.delete('/api/quickbooks/auth/disconnect',
    authMiddleware,
    quickbooksController.disconnect
  );

  /**
   * ==========================================
   * INVOICE ENDPOINTS
   * ==========================================
   */

  /**
   * Get invoices from QuickBooks
   * GET /api/quickbooks/invoices
   * Required: User authentication, active QuickBooks connection
   * Query params: startDate, endDate, customerRef, limit, orderBy
   */
  app.get('/api/quickbooks/invoices',
    authMiddleware,
    quickbooksAuthMiddleware,
    ensureValidQuickBooksToken,
    validator.query(quickbooksValidation.getInvoices),
    quickbooksController.getInvoices
  );

  /**
   * Create invoice in QuickBooks
   * POST /api/quickbooks/invoices
   * Required: User authentication, active QuickBooks connection
   * Body: Invoice data (CustomerRef, Line items, etc.)
   */
  app.post('/api/quickbooks/invoices',
    authMiddleware,
    quickbooksAuthMiddleware,
    validator.body(quickbooksValidation.createInvoice),
    quickbooksController.createInvoice || ((req, res) => {
      const resModel = require('../lib/resModel');
      resModel.success = false;
      resModel.message = 'Create invoice endpoint not yet implemented';
      resModel.data = null;
      return res.status(501).json(resModel);
    })
  );

  /**
   * ==========================================
   * CUSTOMER ENDPOINTS
   * ==========================================
   */

  /**
   * Get customers from QuickBooks
   * GET /api/quickbooks/customers
   * Required: User authentication, active QuickBooks connection
   * Query params: startDate, endDate, active, limit, orderBy
   */
  app.get('/api/quickbooks/customers',
    authMiddleware,
    quickbooksAuthMiddleware,
    ensureValidQuickBooksToken,
    validator.query(quickbooksValidation.getCustomers),
    quickbooksController.getCustomers
  );

  /**
   * Create customer in QuickBooks
   * POST /api/quickbooks/customers
   * Required: User authentication, active QuickBooks connection
   * Body: Customer data (DisplayName, Email, Phone, etc.)
   */
  app.post('/api/quickbooks/customers',
    authMiddleware,
    quickbooksAuthMiddleware,
    validator.body(quickbooksValidation.createCustomer),
    quickbooksController.createCustomer || ((req, res) => {
      const resModel = require('../lib/resModel');
      resModel.success = false;
      resModel.message = 'Create customer endpoint not yet implemented';
      resModel.data = null;
      return res.status(501).json(resModel);
    })
  );

  /**
   * ==========================================
   * EXPENSE ENDPOINTS
   * ==========================================
   */

  /**
   * Get expenses from QuickBooks
   * GET /api/quickbooks/expenses
   * Required: User authentication, active QuickBooks connection
   * Query params: startDate, endDate, limit, orderBy
   */
  app.get('/api/quickbooks/expenses',
    authMiddleware,
    quickbooksAuthMiddleware,
    ensureValidQuickBooksToken,
    validator.query(quickbooksValidation.getExpenses),
    quickbooksController.getExpenses
  );

  /**
   * Create expense in QuickBooks
   * POST /api/quickbooks/expenses
   * Required: User authentication, active QuickBooks connection
   * Body: Expense data (PaymentType, AccountRef, Amount, etc.)
   */
  app.post('/api/quickbooks/expenses',
    authMiddleware,
    quickbooksAuthMiddleware,
    validator.body(quickbooksValidation.createExpense),
    quickbooksController.createExpense || ((req, res) => {
      const resModel = require('../lib/resModel');
      resModel.success = false;
      resModel.message = 'Create expense endpoint not yet implemented';
      resModel.data = null;
      return res.status(501).json(resModel);
    })
  );

  /**
   * ==========================================
   * VENDOR ENDPOINTS
   * ==========================================
   */

  /**
   * Get vendors from QuickBooks
   * GET /api/quickbooks/vendors
   * Required: User authentication, active QuickBooks connection
   * Query params: startDate, endDate, active, limit, orderBy
   */
  app.get('/api/quickbooks/vendors',
    authMiddleware,
    quickbooksAuthMiddleware,
    validator.query(quickbooksValidation.getVendors),
    quickbooksController.getVendors
  );

  /**
   * ==========================================
   * BILL ENDPOINTS
   * ==========================================
   */

  /**
   * Get bills from QuickBooks
   * GET /api/quickbooks/bills
   * Required: User authentication, active QuickBooks connection
   * Query params: startDate, endDate, limit, orderBy
   */
  app.get('/api/quickbooks/bills',
    authMiddleware,
    quickbooksAuthMiddleware,
    validator.query(quickbooksValidation.getBills),
    quickbooksController.getBills
  );

  /**
   * ==========================================
   * REPORT ENDPOINTS
   * ==========================================
   */

  /**
   * Get Profit & Loss report
   * GET /api/quickbooks/reports/profit-loss
   * Required: User authentication, active QuickBooks connection
   * Query params: startDate (required), endDate (required), summarizeBy
   */
  app.get('/api/quickbooks/reports/profit-loss',
    authMiddleware,
    quickbooksAuthMiddleware,
    validator.query(quickbooksValidation.getReport),
    quickbooksController.getProfitLossReport
  );

  /**
   * Get Balance Sheet report
   * GET /api/quickbooks/reports/balance-sheet
   * Required: User authentication, active QuickBooks connection
   * Query params: startDate (required), endDate (required), summarizeBy
   */
  app.get('/api/quickbooks/reports/balance-sheet',
    authMiddleware,
    quickbooksAuthMiddleware,
    validator.query(quickbooksValidation.getReport),
    quickbooksController.getBalanceSheetReport
  );

  /**
   * Get Cash Flow report
   * GET /api/quickbooks/reports/cash-flow
   * Required: User authentication, active QuickBooks connection
   * Query params: startDate (required), endDate (required), summarizeBy
   */
  app.get('/api/quickbooks/reports/cash-flow',
    authMiddleware,
    quickbooksAuthMiddleware,
    validator.query(quickbooksValidation.getReport),
    quickbooksController.getCashFlowReport || ((req, res) => {
      const resModel = require('../lib/resModel');
      resModel.success = false;
      resModel.message = 'Cash Flow report endpoint not yet implemented';
      resModel.data = null;
      return res.status(501).json(resModel);
    })
  );

  
  app.get('/api/quickbooks/reports/general-ledger',
    authMiddleware,
    quickbooksAuthMiddleware,
    validator.query(quickbooksValidation.getReport),
    quickbooksController.getGeneralLedgerReport
  );

  /**
   * ==========================================
   * DASHBOARD & AGGREGATED DATA
   * ==========================================
   */

  /**
   * Get dashboard data (aggregated metrics)
   * GET /api/quickbooks/dashboard
   * Required: User authentication, active QuickBooks connection
   * Returns: Recent invoices, expenses, customers, stats
   */
  app.get('/api/quickbooks/dashboard',
    authMiddleware,
    quickbooksAuthMiddleware,
    quickbooksController.getDashboardData
  );

  /**
   * ==========================================
   * WEBHOOK ENDPOINTS
   * ==========================================
   */

  /**
   * Handle QuickBooks webhooks
   * POST /api/quickbooks/webhooks
   * Note: No auth middleware as this comes from QuickBooks
   * Headers: intuit-signature (for verification)
   */
  app.post('/api/quickbooks/webhooks',
    validator.body(quickbooksValidation.webhook),
    quickbooksController.handleWebhook || ((req, res) => {
      const resModel = require('../lib/resModel');
      resModel.success = false;
      resModel.message = 'Webhook handler not yet implemented';
      resModel.data = null;
      return res.status(501).json(resModel);
    })
  );

  /**
   * ==========================================
   * HEALTH & STATUS ENDPOINTS
   * ==========================================
   */

  /**
   * Health check for QuickBooks integration
   * GET /api/quickbooks/health
   * Public endpoint to check if QuickBooks integration is configured
   * Returns: Configuration status and environment info
   */
  app.get('/api/quickbooks/health',
    quickbooksController.health
  );

  app.get('/api/quickbooks/sync', authMiddleware,
    quickbooksAuthMiddleware,
    quickbooksController.syncQuickBooksData)

  app.get("/api/quickbooks/cashBalance", authMiddleware,quickbooksAuthMiddleware, quickbooksController.getCashBalance)
  app.get("/api/quickbooks/essentialStats", authMiddleware, quickbooksAuthMiddleware, quickbooksController.getEssentailDashboardstats)

  /**
   * ==========================================
   * TEST ENDPOINTS (Development Only)
   * ==========================================
   */

  if (process.env.NODE_ENV === 'development') {
    /**
     * Test OAuth URL generation
     * GET /api/quickbooks/test/auth-url
     * Public endpoint for testing OAuth URL generation
     */
    app.get('/api/quickbooks/test/auth-url', (req, res) => {
      const quickbooksService = require('../services/quickbooks.service');
      const resModel = require('../lib/resModel');

      try {
        const testUserId = 'test-user-123';
        const { url, state } = quickbooksService.generateAuthUrl(testUserId);

        resModel.success = true;
        resModel.message = 'Test auth URL generated';
        resModel.data = {
          authUrl: url,
          state: state,
          environment: process.env.QUICKBOOKS_ENVIRONMENT || 'sandbox',
          scopes: process.env.QUICKBOOKS_SCOPES?.split(' ') || []
        };
        return res.status(200).json(resModel);
      } catch (error) {
        resModel.success = false;
        resModel.message = error.message;
        resModel.data = null;
        return res.status(500).json(resModel);
      }
    });
  }
};