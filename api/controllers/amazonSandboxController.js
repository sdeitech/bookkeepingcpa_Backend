const AmazonSeller = require('../models/amazonSellerModel');
const amazonService = require('../services/amazon.services.sdk');
const encryptionService = require('../services/encryption.services');
const resModel = require('../lib/resModel');

/**
 * Amazon Sandbox Controller
 * Separate controller for sandbox/testing purposes
 * Uses refresh token directly without OAuth flow
 */
const amazonSandboxController = {
  /**
   * Initialize sandbox mode with refresh token
   * POST /api/amazon/sandbox/initialize
   * This bypasses OAuth and directly sets up with refresh token
   */
  initializeSandbox: async (req, res) => {
    try {
      const userId = req.userInfo?.id || req.userInfo?.userId;
      
      if (!userId) {
        resModel.success = false;
        resModel.message = 'User authentication required';
        resModel.data = null;
        return res.status(401).json(resModel);
      }

      // Get refresh token from environment or request body
      const refreshToken = req.body.refreshToken || process.env.AMAZON_SANDBOX_REFRESH_TOKEN;
      const sellerId = req.body.sellerId || process.env.AMAZON_SANDBOX_SELLER_ID || 'SANDBOX_SELLER';
      const marketplaceIds = req.body.marketplaceIds || 
                            (process.env.AMAZON_SANDBOX_MARKETPLACE_IDS ? 
                             process.env.AMAZON_SANDBOX_MARKETPLACE_IDS.split(',') : 
                             ['ATVPDKIKX0DER']); // Default to US marketplace

      if (!refreshToken) {
        resModel.success = false;
        resModel.message = 'Refresh token is required for sandbox initialization';
        resModel.data = null;
        return res.status(400).json(resModel);
      }

      // Get access token using refresh token
      let accessToken;
      let tokenExpiresAt;
      
      try {
        console.log("refresh token",refreshToken)
        const tokenData = await amazonService.refreshAccessToken(refreshToken);
        console.log("tokenData",tokenData);
        accessToken = tokenData.accessToken;
        tokenExpiresAt = new Date(Date.now() + (tokenData.expiresIn * 1000));
      } catch (tokenError) {
        console.error('Failed to get access token from refresh token:', tokenError);
        resModel.success = false;
        resModel.message = `Failed to get access token: ${tokenError.message}`;
        resModel.data = null;
        return res.status(400).json(resModel);
      }

      // Encrypt tokens for storage
      const encryptedAccessToken = encryptionService.encrypt(accessToken);
      const encryptedRefreshToken = encryptionService.encrypt(refreshToken);

      // Save or update sandbox seller data
      const sandboxData = {
        userId,
        sellerId,
        sellerEmail: `sandbox-${userId}@test.com`,
        sellerName: `Sandbox Test User ${userId}`,
        marketplaceIds,
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        tokenExpiresAt,
        isActive: true,
        isSandbox: true, // Mark as sandbox account
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
      };

      const sellerData = await AmazonSeller.findOneAndUpdate(
        { userId, isSandbox: true },
        sandboxData,
        { 
          upsert: true, 
          new: true,
          runValidators: true
        }
      );

      resModel.success = true;
      resModel.message = 'Sandbox mode initialized successfully';
      resModel.data = {
        connected: true,
        isSandbox: true,
        sellerId: sellerData.sellerId,
        sellerName: sellerData.sellerName,
        marketplaceIds: sellerData.marketplaceIds,
        tokenExpiresAt: sellerData.tokenExpiresAt
      };
      return res.status(200).json(resModel);
    } catch (error) {
      console.error('Initialize sandbox error:', error);
      resModel.success = false;
      resModel.message = error.message;
      resModel.data = null;
      return res.status(500).json(resModel);
    }
  },

  /**
   * Get sandbox connection status
   * GET /api/amazon/sandbox/status
   */
  getSandboxStatus: async (req, res) => {
    try {
      const userId = req.userInfo?.id || req.userInfo?.userId;
      
      const seller = await AmazonSeller.findOne({ userId, isSandbox: true })
        .select('isActive sellerId sellerName sellerEmail marketplaceIds lastSyncedAt tokenExpiresAt createdAt isSandbox');
      
      if (!seller) {
        resModel.success = true;
        resModel.message = 'Sandbox mode not initialized';
        resModel.data = { 
          connected: false,
          isSandbox: true
        };
        return res.status(200).json(resModel);
      }

      const now = new Date();
      const tokenExpired = seller.tokenExpiresAt < now;
      
      resModel.success = true;
      resModel.message = 'Sandbox status retrieved';
      resModel.data = {
        connected: seller.isActive && !tokenExpired,
        isSandbox: true,
        sellerId: seller.sellerId,
        sellerName: seller.sellerName,
        sellerEmail: seller.sellerEmail,
        marketplaceIds: seller.marketplaceIds,
        lastSyncedAt: seller.lastSyncedAt,
        tokenExpired,
        connectedSince: seller.createdAt
      };
      return res.status(200).json(resModel);
    } catch (error) {
      console.error('Get sandbox status error:', error);
      resModel.success = false;
      resModel.message = error.message;
      resModel.data = null;
      return res.status(500).json(resModel);
    }
  },

  /**
   * Reset sandbox mode
   * DELETE /api/amazon/sandbox/reset
   */
  resetSandbox: async (req, res) => {
    try {
      const userId = req.userInfo?.id || req.userInfo?.userId;
      
      const result = await AmazonSeller.findOneAndDelete({ userId, isSandbox: true });
      
      if (!result) {
        resModel.success = false;
        resModel.message = 'No sandbox configuration found';
        resModel.data = null;
        return res.status(404).json(resModel);
      }
      
      resModel.success = true;
      resModel.message = 'Sandbox mode reset successfully';
      resModel.data = null;
      return res.status(200).json(resModel);
    } catch (error) {
      console.error('Reset sandbox error:', error);
      resModel.success = false;
      resModel.message = error.message;
      resModel.data = null;
      return res.status(500).json(resModel);
    }
  },

  /**
   * Get orders in sandbox mode
   * GET /api/amazon/sandbox/orders
   * Uses the same SP-API but with sandbox credentials
   */
  getSandboxOrders: async (req, res) => {
    console.log("inside sandbox orders");
    try {
      const userId = req.userInfo?.id || req.userInfo?.userId;
      const seller = await AmazonSeller.findOne({ userId, isSandbox: true });
      
      if (!seller || !seller.isActive) {
        resModel.success = false;
        resModel.message = 'Sandbox mode not initialized or inactive';
        resModel.data = null;
        return res.status(404).json(resModel);
      }

      // Check if token needs refresh
      let accessToken = encryptionService.decrypt(seller.accessToken);
      console.log("access token for orders",accessToken)
      const decryptedRefreshToken = encryptionService.decrypt(seller.refreshToken);
      const now = new Date();
      
      if (seller.tokenExpiresAt < now) {
        // Token expired, refresh it
        try {
          const newTokenData = await amazonService.refreshAccessToken(decryptedRefreshToken);
          accessToken = newTokenData.accessToken;
          
          // Update stored tokens
          seller.accessToken = encryptionService.encrypt(newTokenData.accessToken);
          seller.tokenExpiresAt = new Date(Date.now() + (newTokenData.expiresIn * 1000));
          await seller.save();
        } catch (refreshError) {
          console.error('Failed to refresh token in sandbox:', refreshError);
          resModel.success = false;
          resModel.message = 'Failed to refresh access token. Please reinitialize sandbox.';
          resModel.data = null;
          return res.status(401).json(resModel);
        }
      }
      
      // Prepare query parameters
      const queryParams = {
        MarketplaceIds: req.query.marketplaceId ? [req.query.marketplaceId] : seller.marketplaceIds,
        CreatedAfter:'TEST_CASE_200',
        MaxResultsPerPage: req.query.maxResults || 20
      };
      console.log("query params", queryParams)
      
      // Pass both access token and refresh token
      const orders = await amazonService.getOrders(accessToken, queryParams, decryptedRefreshToken);
      console.log("orders from amazon", orders);
      
      // Update last synced time
      seller.lastSyncedAt = new Date();
      await seller.save();

      resModel.success = true;
      resModel.message = 'Sandbox orders fetched successfully';
      resModel.data = {
        isSandbox: true,
        ...orders
      };
      return res.status(200).json(resModel);
    } catch (error) {
      console.error('Get sandbox orders error:', error);
      resModel.success = false;
      resModel.message = `Failed to fetch sandbox orders: ${error.message}`;
      resModel.data = null;
      return res.status(500).json(resModel);
    }
  },

  /**
   * Get inventory in sandbox mode
   * GET /api/amazon/sandbox/inventory
   */
  getSandboxInventory: async (req, res) => {
    try {
      const userId = req.userInfo?.id || req.userInfo?.userId;
      const seller = await AmazonSeller.findOne({ userId, isSandbox: true });
      
      if (!seller || !seller.isActive) {
        resModel.success = false;
        resModel.message = 'Sandbox mode not initialized or inactive';
        resModel.data = null;
        return res.status(404).json(resModel);
      }

      // Check if token needs refresh
      let accessToken = encryptionService.decrypt(seller.accessToken);
      const decryptedRefreshToken = encryptionService.decrypt(seller.refreshToken);
      const now = new Date();
      
      if (seller.tokenExpiresAt < now) {
        // Token expired, refresh it
        try {
          const newTokenData = await amazonService.refreshAccessToken(decryptedRefreshToken);
          accessToken = newTokenData.accessToken;
          
          // Update stored tokens
          seller.accessToken = encryptionService.encrypt(newTokenData.accessToken);
          seller.tokenExpiresAt = new Date(Date.now() + (newTokenData.expiresIn * 1000));
          await seller.save();
        } catch (refreshError) {
          console.error('Failed to refresh token in sandbox:', refreshError);
          resModel.success = false;
          resModel.message = 'Failed to refresh access token. Please reinitialize sandbox.';
          resModel.data = null;
          return res.status(401).json(resModel);
        }
      }
      
      // Prepare query parameters
      const queryParams = {
        marketplaceIds: req.query.marketplaceId ? [req.query.marketplaceId] : seller.marketplaceIds,
        skus: req.query.skus
      };
      
      // Pass both access token and refresh token
      const inventory = await amazonService.getInventory(accessToken, queryParams, decryptedRefreshToken);
      
      // Update last synced time
      seller.lastSyncedAt = new Date();
      await seller.save();

      resModel.success = true;
      resModel.message = 'Sandbox inventory fetched successfully';
      resModel.data = {
        isSandbox: true,
        ...inventory
      };
      return res.status(200).json(resModel);
    } catch (error) {
      console.error('Get sandbox inventory error:', error);
      resModel.success = false;
      resModel.message = `Failed to fetch sandbox inventory: ${error.message}`;
      resModel.data = null;
      return res.status(500).json(resModel);
    }
  },

  /**
   * Test sandbox connection
   * GET /api/amazon/sandbox/test
   * Quick test to verify sandbox setup
   */
  testSandboxConnection: async (req, res) => {
    try {
      const userId = req.userInfo?.id || req.userInfo?.userId;
      const seller = await AmazonSeller.findOne({ userId, isSandbox: true });
      
      if (!seller) {
        resModel.success = false;
        resModel.message = 'Sandbox mode not initialized';
        resModel.data = null;
        return res.status(404).json(resModel);
      }

      // Try to get access token using refresh token
      const decryptedRefreshToken = encryptionService.decrypt(seller.refreshToken);
      
      try {
        const tokenData = await amazonService.refreshAccessToken(decryptedRefreshToken);
        
        resModel.success = true;
        resModel.message = 'Sandbox connection test successful';
        resModel.data = {
          isSandbox: true,
          tokenValid: true,
          expiresIn: tokenData.expiresIn,
          sellerId: seller.sellerId,
          marketplaceIds: seller.marketplaceIds
        };
        return res.status(200).json(resModel);
      } catch (tokenError) {
        resModel.success = false;
        resModel.message = `Sandbox connection test failed: ${tokenError.message}`;
        resModel.data = {
          isSandbox: true,
          tokenValid: false,
          error: tokenError.message
        };
        return res.status(400).json(resModel);
      }
    } catch (error) {
      console.error('Test sandbox connection error:', error);
      resModel.success = false;
      resModel.message = error.message;
      resModel.data = null;
      return res.status(500).json(resModel);
    }
  }
};

module.exports = amazonSandboxController;