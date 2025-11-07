const AmazonSeller = require('../models/amazonSellerModel');
const amazonService = require('../services/amazon.services.sdk');
const encryptionService = require('../services/encryption.services');
const resModel = require('../lib/resModel');
const { getUserId } = require('../utils/getUserContext');

const amazonController = {
  /**
   * Generate OAuth authorization URL
   * GET /api/amazon/auth/authorize
   */
  getAuthorizationUrl: async (req, res) => {
    try {
      const userId = getUserId(req); // Support admin override
      
      if (!userId) {
        resModel.success = false;
        resModel.message = 'User authentication required';
        resModel.data = null;
        return res.status(401).json(resModel);
      }

      // Generate authorization URL with state
      const { url, state } = amazonService.generateAuthUrl(userId);
      
      resModel.success = true;
      resModel.message = 'Authorization URL generated successfully';
      resModel.data = {
        authUrl: url,
        state
      };
      return res.status(200).json(resModel);
    } catch (error) {
      console.error('Generate auth URL error:', error);
      resModel.success = false;
      resModel.message = error.message;
      resModel.data = null;
      return res.status(500).json(resModel);
    }
  },

  /**
   * Handle OAuth callback from Amazon
   * POST /api/amazon/auth/callback
   */
  handleCallback: async (req, res) => {
    try {
      const { code, state, error, error_description } = req.body;
      
      // Check for authorization errors
      if (error) {
        console.error('Amazon authorization error:', error, error_description);
        resModel.success = false;
        resModel.message = `Amazon authorization failed: ${error_description || error}`;
        resModel.data = null;
        return res.status(400).json(resModel);
      }

      if (!code || !state) {
        resModel.success = false;
        resModel.message = 'Missing authorization code or state';
        resModel.data = null;
        return res.status(400).json(resModel);
      }

      // Exchange code for tokens
      const tokenData = await amazonService.exchangeCodeForTokens(code, state);
      
      // Get seller profile
      const sellerProfile = await amazonService.getSellerProfile(tokenData.accessToken);
      
      // Encrypt tokens before storing
      const encryptedAccessToken = encryptionService.encrypt(tokenData.accessToken);
      const encryptedRefreshToken = encryptionService.encrypt(tokenData.refreshToken);
      
      // Calculate token expiry
      const tokenExpiresAt = new Date(Date.now() + (tokenData.expiresIn * 1000));

      // Get marketplace participation
      let marketplaceIds = [];
      try {
        const marketplaces = await amazonService.getMarketplaceParticipation(tokenData.accessToken);
        marketplaceIds = marketplaces.map(m => m.marketplaceId);
      } catch (marketError) {
        console.error('Failed to get marketplace participation:', marketError);
        // Default to US marketplace if fetch fails
        marketplaceIds = ['ATVPDKIKX0DER'];
      }

      // Save or update seller data
      const sellerData = await AmazonSeller.findOneAndUpdate(
        { userId: tokenData.userId },
        {
          sellerId: sellerProfile.sellerId,
          sellerEmail: sellerProfile.sellerEmail,
          sellerName: sellerProfile.sellerName,
          marketplaceIds: marketplaceIds,
          accessToken: encryptedAccessToken,
          refreshToken: encryptedRefreshToken,
          tokenExpiresAt,
          isActive: true,
          lastSyncedAt: new Date(),
          region: 'us-east-1',
          permissions: {
            orders: true,
            inventory: true,
            reports: true,
            finance: true,
            catalog: true,
            feeds: true,
            shipments: true,
            products: true
          }
        },
        {
          upsert: true,
          new: true,
          runValidators: true
        }
      );

      resModel.success = true;
      resModel.message = 'Amazon account connected successfully';
      resModel.data = {
        connected: true,
        sellerId: sellerData.sellerId,
        sellerName: sellerData.sellerName,
        marketplaceIds: sellerData.marketplaceIds
      };
      return res.status(200).json(resModel);
    } catch (error) {
      console.error('Handle callback error:', error);
      resModel.success = false;
      resModel.message = error.message;
      resModel.data = null;
      return res.status(500).json(resModel);
    }
  },

  /**
   * Refresh access token
   * POST /api/amazon/auth/refresh
   */
  refreshToken: async (req, res) => {
    try {
      const userId = getUserId(req);
      const seller = await AmazonSeller.findOne({ userId });
      
      if (!seller) {
        resModel.success = false;
        resModel.message = 'Amazon account not connected';
        resModel.data = null;
        return res.status(404).json(resModel);
      }

      // Decrypt refresh token
      const decryptedRefreshToken = encryptionService.decrypt(seller.refreshToken);
      
      // Get new access token
      const newTokenData = await amazonService.refreshAccessToken(decryptedRefreshToken);
      
      // Update tokens in database
      seller.accessToken = encryptionService.encrypt(newTokenData.accessToken);
      seller.tokenExpiresAt = new Date(Date.now() + (newTokenData.expiresIn * 1000));
      seller.lastSyncedAt = new Date();
      await seller.save();

      resModel.success = true;
      resModel.message = 'Token refreshed successfully';
      resModel.data = {
        expiresAt: seller.tokenExpiresAt
      };
      return res.status(200).json(resModel);
    } catch (error) {
      console.error('Refresh token error:', error);
      
      // If refresh fails, mark account as inactive
      await AmazonSeller.findOneAndUpdate(
        { userId: getUserId(req) },
        {
          isActive: false,
          lastError: {
            message: error.message,
            code: 'TOKEN_REFRESH_FAILED',
            timestamp: new Date()
          }
        }
      );
      
      resModel.success = false;
      resModel.message = 'Token refresh failed. Please reconnect your Amazon account.';
      resModel.data = null;
      return res.status(401).json(resModel);
    }
  },

  /**
   * Check Amazon connection status
   * GET /api/amazon/auth/status
   */
  getConnectionStatus: async (req, res) => {
    try {
      const userId = getUserId(req);
      const seller = await AmazonSeller.findOne({ userId })
        .select('isActive sellerId sellerName sellerEmail marketplaceIds lastSyncedAt tokenExpiresAt createdAt');
      
      if (!seller) {
        resModel.success = true;
        resModel.message = 'Amazon account not connected';
        resModel.data = {
          connected: false
        };
        return res.status(200).json(resModel);
      }

      const now = new Date();
      const tokenExpired = seller.tokenExpiresAt < now;
      const needsRefresh = seller.needsTokenRefresh;
      
      resModel.success = true;
      resModel.message = 'Connection status retrieved';
      resModel.data = {
        connected: seller.isActive && !tokenExpired,
        sellerId: seller.sellerId,
        sellerName: seller.sellerName,
        sellerEmail: seller.sellerEmail,
        marketplaceIds: seller.marketplaceIds,
        lastSyncedAt: seller.lastSyncedAt,
        tokenExpired,
        needsRefresh,
        connectedSince: seller.createdAt
      };
      return res.status(200).json(resModel);
    } catch (error) {
      console.error('Get connection status error:', error);
      resModel.success = false;
      resModel.message = error.message;
      resModel.data = null;
      return res.status(500).json(resModel);
    }
  },

  /**
   * Disconnect Amazon account
   * DELETE /api/amazon/auth/disconnect
   */
  disconnect: async (req, res) => {
    try {
      const userId = getUserId(req);
      const seller = await AmazonSeller.findOne({ userId });
      
      if (!seller) {
        resModel.success = false;
        resModel.message = 'Amazon account not connected';
        resModel.data = null;
        return res.status(404).json(resModel);
      }
      
      // Delete seller record
      await AmazonSeller.findOneAndDelete({ userId });
      
      resModel.success = true;
      resModel.message = 'Amazon account disconnected successfully';
      resModel.data = null;
      return res.status(200).json(resModel);
    } catch (error) {
      console.error('Disconnect error:', error);
      resModel.success = false;
      resModel.message = error.message;
      resModel.data = null;
      return res.status(500).json(resModel);
    }
  },

  /**
   * Get orders from Amazon
   * GET /api/amazon/orders
   */
  getOrders: async (req, res) => {
    try {
      const userId = getUserId(req);
      const seller = await AmazonSeller.findOne({ userId });
      
      if (!seller || !seller.isActive) {
        resModel.success = false;
        resModel.message = 'Amazon account not connected or inactive';
        resModel.data = null;
        return res.status(404).json(resModel);
      }

      // Refresh token if needed
      let accessToken = encryptionService.decrypt(seller.accessToken);
      
      if (seller.needsTokenRefresh) {
        const decryptedRefreshToken = encryptionService.decrypt(seller.refreshToken);
        const newTokenData = await amazonService.refreshAccessToken(decryptedRefreshToken);
        accessToken = newTokenData.accessToken;
        
        // Update stored tokens
        seller.accessToken = encryptionService.encrypt(newTokenData.accessToken);
        seller.tokenExpiresAt = new Date(Date.now() + (newTokenData.expiresIn * 1000));
        await seller.save();
      }
      
      // Prepare query parameters
      const queryParams = {
        marketplaceIds: req.query.marketplaceId ? [req.query.marketplaceId] : seller.marketplaceIds,
        createdAfter: req.query.createdAfter,
        createdBefore: req.query.createdBefore,
        orderStatuses: req.query.orderStatuses,
        maxResults: req.query.maxResults
      };
      
      // Fetch orders
      const orders = await amazonService.getOrders(accessToken, queryParams);
      
      // Update last synced time
      seller.lastSyncedAt = new Date();
      await seller.save();

      resModel.success = true;
      resModel.message = 'Orders fetched successfully';
      resModel.data = orders;
      return res.status(200).json(resModel);
    } catch (error) {
      console.error('Get orders error:', error);
      resModel.success = false;
      resModel.message = `Failed to fetch orders: ${error.message}`;
      resModel.data = null;
      return res.status(500).json(resModel);
    }
  },

  /**
   * Get inventory from Amazon
   * GET /api/amazon/inventory
   */
  getInventory: async (req, res) => {
    try {
      const userId = getUserId(req);
      const seller = await AmazonSeller.findOne({ userId });
      
      if (!seller || !seller.isActive) {
        resModel.success = false;
        resModel.message = 'Amazon account not connected or inactive';
        resModel.data = null;
        return res.status(404).json(resModel);
      }

      // Refresh token if needed
      let accessToken = encryptionService.decrypt(seller.accessToken);
      
      if (seller.needsTokenRefresh) {
        const decryptedRefreshToken = encryptionService.decrypt(seller.refreshToken);
        const newTokenData = await amazonService.refreshAccessToken(decryptedRefreshToken);
        accessToken = newTokenData.accessToken;
        
        seller.accessToken = encryptionService.encrypt(newTokenData.accessToken);
        seller.tokenExpiresAt = new Date(Date.now() + (newTokenData.expiresIn * 1000));
        await seller.save();
      }
      
      // Prepare query parameters
      const queryParams = {
        marketplaceIds: req.query.marketplaceId ? [req.query.marketplaceId] : seller.marketplaceIds,
        skus: req.query.skus
      };
      
      // Fetch inventory
      const inventory = await amazonService.getInventory(accessToken, queryParams);
      
      // Update last synced time
      seller.lastSyncedAt = new Date();
      await seller.save();

      resModel.success = true;
      resModel.message = 'Inventory fetched successfully';
      resModel.data = inventory;
      return res.status(200).json(resModel);
    } catch (error) {
      console.error('Get inventory error:', error);
      resModel.success = false;
      resModel.message = `Failed to fetch inventory: ${error.message}`;
      resModel.data = null;
      return res.status(500).json(resModel);
    }
  },

  /**
   * Get financial events
   * GET /api/amazon/finance
   */
  getFinancialEvents: async (req, res) => {
    try {
      const userId = getUserId(req);
      const seller = await AmazonSeller.findOne({ userId });
      
      if (!seller || !seller.isActive) {
        resModel.success = false;
        resModel.message = 'Amazon account not connected or inactive';
        resModel.data = null;
        return res.status(404).json(resModel);
      }

      // Refresh token if needed
      let accessToken = encryptionService.decrypt(seller.accessToken);
      
      if (seller.needsTokenRefresh) {
        const decryptedRefreshToken = encryptionService.decrypt(seller.refreshToken);
        const newTokenData = await amazonService.refreshAccessToken(decryptedRefreshToken);
        accessToken = newTokenData.accessToken;
        
        seller.accessToken = encryptionService.encrypt(newTokenData.accessToken);
        seller.tokenExpiresAt = new Date(Date.now() + (newTokenData.expiresIn * 1000));
        await seller.save();
      }
      
      // Prepare query parameters
      const queryParams = {
        postedAfter: req.query.postedAfter,
        postedBefore: req.query.postedBefore,
        maxResults: req.query.maxResults
      };
      
      // Fetch financial events
      const financialEvents = await amazonService.getFinancialEvents(accessToken, queryParams);
      
      // Update last synced time
      seller.lastSyncedAt = new Date();
      await seller.save();

      resModel.success = true;
      resModel.message = 'Financial events fetched successfully';
      resModel.data = financialEvents;
      return res.status(200).json(resModel);
    } catch (error) {
      console.error('Get financial events error:', error);
      resModel.success = false;
      resModel.message = `Failed to fetch financial events: ${error.message}`;
      resModel.data = null;
      return res.status(500).json(resModel);
    }
  },

  /**
   * Create report request
   * POST /api/amazon/reports
   */
  createReport: async (req, res) => {
    try {
      const userId = getUserId(req);
      const { reportType, dataStartTime, dataEndTime } = req.body;
      
      if (!reportType) {
        resModel.success = false;
        resModel.message = 'Report type is required';
        resModel.data = null;
        return res.status(400).json(resModel);
      }
      
      const seller = await AmazonSeller.findOne({ userId });
      
      if (!seller || !seller.isActive) {
        resModel.success = false;
        resModel.message = 'Amazon account not connected or inactive';
        resModel.data = null;
        return res.status(404).json(resModel);
      }

      // Refresh token if needed
      let accessToken = encryptionService.decrypt(seller.accessToken);
      
      if (seller.needsTokenRefresh) {
        const decryptedRefreshToken = encryptionService.decrypt(seller.refreshToken);
        const newTokenData = await amazonService.refreshAccessToken(decryptedRefreshToken);
        accessToken = newTokenData.accessToken;
        
        seller.accessToken = encryptionService.encrypt(newTokenData.accessToken);
        seller.tokenExpiresAt = new Date(Date.now() + (newTokenData.expiresIn * 1000));
        await seller.save();
      }
      
      // Create report request
      const reportRequest = await amazonService.createReport(accessToken, {
        reportType,
        marketplaceIds: seller.marketplaceIds,
        dataStartTime,
        dataEndTime
      });

      resModel.success = true;
      resModel.message = 'Report request created successfully';
      resModel.data = reportRequest;
      return res.status(200).json(resModel);
    } catch (error) {
      console.error('Create report error:', error);
      resModel.success = false;
      resModel.message = `Failed to create report: ${error.message}`;
      resModel.data = null;
      return res.status(500).json(resModel);
    }
  },

  /**
   * Get report document
   * GET /api/amazon/reports/:reportDocumentId
   */
  getReportDocument: async (req, res) => {
    try {
      const userId = getUserId(req);
      const { reportDocumentId } = req.params;
      
      if (!reportDocumentId) {
        resModel.success = false;
        resModel.message = 'Report document ID is required';
        resModel.data = null;
        return res.status(400).json(resModel);
      }
      
      const seller = await AmazonSeller.findOne({ userId });
      
      if (!seller || !seller.isActive) {
        resModel.success = false;
        resModel.message = 'Amazon account not connected or inactive';
        resModel.data = null;
        return res.status(404).json(resModel);
      }

      // Refresh token if needed
      let accessToken = encryptionService.decrypt(seller.accessToken);
      
      if (seller.needsTokenRefresh) {
        const decryptedRefreshToken = encryptionService.decrypt(seller.refreshToken);
        const newTokenData = await amazonService.refreshAccessToken(decryptedRefreshToken);
        accessToken = newTokenData.accessToken;
        
        seller.accessToken = encryptionService.encrypt(newTokenData.accessToken);
        seller.tokenExpiresAt = new Date(Date.now() + (newTokenData.expiresIn * 1000));
        await seller.save();
      }
      
      // Get report document
      const reportDocument = await amazonService.getReportDocument(accessToken, reportDocumentId);

      resModel.success = true;
      resModel.message = 'Report document fetched successfully';
      resModel.data = reportDocument;
      return res.status(200).json(resModel);
    } catch (error) {
      console.error('Get report document error:', error);
      resModel.success = false;
      resModel.message = `Failed to get report document: ${error.message}`;
      resModel.data = null;
      return res.status(500).json(resModel);
    }
  },

  /**
   * Get seller metrics/dashboard data
   * GET /api/amazon/dashboard
   */
  getDashboardData: async (req, res) => {
    try {
      const userId = getUserId(req);
      const seller = await AmazonSeller.findOne({ userId });
      
      if (!seller || !seller.isActive) {
        resModel.success = false;
        resModel.message = 'Amazon account not connected or inactive';
        resModel.data = null;
        return res.status(404).json(resModel);
      }

      // Refresh token if needed
      let accessToken = encryptionService.decrypt(seller.accessToken);
      
      if (seller.needsTokenRefresh) {
        const decryptedRefreshToken = encryptionService.decrypt(seller.refreshToken);
        const newTokenData = await amazonService.refreshAccessToken(decryptedRefreshToken);
        accessToken = newTokenData.accessToken;
        
        seller.accessToken = encryptionService.encrypt(newTokenData.accessToken);
        seller.tokenExpiresAt = new Date(Date.now() + (newTokenData.expiresIn * 1000));
        await seller.save();
      }
      
      // Fetch multiple data points for dashboard
      const dashboardData = {
        seller: {
          sellerId: seller.sellerId,
          sellerName: seller.sellerName,
          marketplaceIds: seller.marketplaceIds,
          lastSyncedAt: seller.lastSyncedAt
        },
        metrics: {}
      };

      // Fetch recent orders (last 7 days)
      try {
        const orders = await amazonService.getOrders(accessToken, {
          marketplaceIds: seller.marketplaceIds,
          createdAfter: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
        });
        dashboardData.metrics.recentOrders = orders;
      } catch (error) {
        console.error('Failed to fetch orders for dashboard:', error);
        dashboardData.metrics.recentOrders = { error: error.message };
      }

      // Fetch inventory summary
      try {
        const inventory = await amazonService.getInventory(accessToken, {
          marketplaceIds: seller.marketplaceIds
        });
        dashboardData.metrics.inventory = inventory;
      } catch (error) {
        console.error('Failed to fetch inventory for dashboard:', error);
        dashboardData.metrics.inventory = { error: error.message };
      }

      // Update last synced time
      seller.lastSyncedAt = new Date();
      await seller.save();

      resModel.success = true;
      resModel.message = 'Dashboard data fetched successfully';
      resModel.data = dashboardData;
      return res.status(200).json(resModel);
    } catch (error) {
      console.error('Get dashboard data error:', error);
      resModel.success = false;
      resModel.message = `Failed to fetch dashboard data: ${error.message}`;
      resModel.data = null;
      return res.status(500).json(resModel);
    }
  }
};

module.exports = amazonController;