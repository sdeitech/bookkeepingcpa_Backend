const ShopifyStore = require('../models/shopifyStoreModel');
const shopifyService = require('../services/shopify.service');
const encryptionService = require('../services/encryption.services');
const resModel = require('../lib/resModel');
const { getUserId } = require('../utils/getUserContext');

const shopifyController = {
  /**
   * Generate OAuth authorization URL
   * GET /api/shopify/auth/authorize
   * Query params: shop (e.g., mystore.myshopify.com)
   */
  getAuthorizationUrl: async (req, res) => {
    try {
      const userId = getUserId(req); // Support admin override
      const { shop } = req.query;
      
      if (!userId) {
        resModel.success = false;
        resModel.message = 'User authentication required';
        resModel.data = null;
        return res.status(401).json(resModel);
      }
      
      if (!shop) {
        resModel.success = false;
        resModel.message = 'Shop domain is required. Please provide your .myshopify.com domain';
        resModel.data = null;
        return res.status(400).json(resModel);
      }

      // Check if store already connected
      const existingStore = await ShopifyStore.findOne({
        userId,
        shopDomain: shop.toLowerCase()
      });
      
      console.log('🔍 Checking existing store connection:');
      console.log('  - Store found:', !!existingStore);
      console.log('  - Is active:', existingStore?.isActive);
      console.log('  - Shop domain:', existingStore?.shopDomain);
      
      if (existingStore && existingStore.isActive) {
        console.log('❌ Store already connected, blocking reconnection');
        resModel.success = false;
        resModel.message = 'This shop is already connected. Please disconnect first to reconnect.';
        resModel.data = {
          connected: true,
          shopName: existingStore.shopName
        };
        return res.status(400).json(resModel);
      }
      
      // If store exists but is inactive (disconnected), allow reconnection
      if (existingStore && !existingStore.isActive) {
        console.log('✅ Store was disconnected, allowing reconnection');
      }

      // Generate auth URL using SDK
      const { url, state } = await shopifyService.generateAuthUrl(shop, userId);
      
      resModel.success = true;
      resModel.message = 'Authorization URL generated successfully';
      resModel.data = { 
        authUrl: url,
        state: state
      };
      return res.status(200).json(resModel);
    } catch (error) {
      console.error('Generate auth URL error:', error);
      resModel.success = false;
      resModel.message = error.message || 'Failed to generate authorization URL';
      resModel.data = null;
      return res.status(500).json(resModel);
    }
  },

  /**
   * Handle OAuth callback from Shopify
   * GET /api/shopify/auth/callback
   * Query params: code, state, shop, hmac, timestamp
   */
  handleCallback: async (req, res) => {
    try {
      const { shop, code, state, error, error_description } = req.query;
      
      // Enhanced diagnostic logging
      console.log('🔍 Shopify OAuth Callback Debug:');
      console.log('  - Full URL:', req.originalUrl);
      console.log('  - Query params:', req.query);
      console.log('  - Shop:', shop);
      console.log('  - Code:', code ? 'Present' : 'Missing');
      console.log('  - State:', state);
      console.log('  - Error:', error);
      console.log('  - Frontend URL:', process.env.FRONTEND_URL);
      
      // Check for authorization errors from Shopify
      if (error) {
        console.error('❌ Shopify authorization error:', error, error_description);
        const frontendUrl = `${process.env.FRONTEND_URL}/shopify-callback?success=false&error=${encodeURIComponent(error_description || error)}`;
        console.log('  - Redirecting to:', frontendUrl);
        return res.redirect(frontendUrl);
      }

      if (!code || !state || !shop) {
        console.error('❌ Missing required parameters');
        console.log('  - Code present:', !!code);
        console.log('  - State present:', !!state);
        console.log('  - Shop present:', !!shop);
        const frontendUrl = `${process.env.FRONTEND_URL}/shopify-callback?success=false&error=${encodeURIComponent('Missing required parameters')}`;
        console.log('  - Redirecting to:', frontendUrl);
        return res.redirect(frontendUrl);
      }

      console.log('✅ All required parameters present, completing OAuth...');
      
      // Complete OAuth using SDK
      const authResult = await shopifyService.completeAuth(req, res);
      
      console.log('📦 Auth result received:');
      console.log('  - AccessToken:', authResult.accessToken ? 'Present' : 'Missing');
      console.log('  - Shop:', authResult.shop);
      console.log('  - UserId:', authResult.userId);
      console.log('  - Session ID:', authResult.session?.id);
      
      if (!authResult.accessToken) {
        throw new Error('Failed to obtain access token from Shopify');
      }

      // Get shop details
      console.log('📊 Fetching shop details...');
      const shopDetails = await shopifyService.getShopDetails(authResult.session);
      
      if (!shopDetails) {
        console.error('❌ Failed to fetch shop details');
        throw new Error('Failed to fetch shop details');
      }
      
      console.log('✅ Shop details fetched:');
      console.log('  - Shop name:', shopDetails.name);
      console.log('  - Shop email:', shopDetails.email);
      console.log('  - Plan:', shopDetails.plan_name);

      // Encrypt access token before storing
      const encryptedToken = encryptionService.encrypt(authResult.accessToken);
      
      // Check if this user already has this shop connected
      // Multiple users can connect to the same shop
      const existingUserShop = await ShopifyStore.findOne({
        userId: authResult.userId,
        shopDomain: authResult.shop
      });
      
      let storeData;
      
      if (existingUserShop) {
        // Update existing store connection for this user
        existingUserShop.shopName = shopDetails.name;
        existingUserShop.shopEmail = shopDetails.email;
        existingUserShop.shopOwner = shopDetails.shop_owner;
        existingUserShop.shopPlan = shopDetails.plan_name;
        existingUserShop.shopCountry = shopDetails.country_name;
        existingUserShop.shopCurrency = shopDetails.currency;
        existingUserShop.shopTimezone = shopDetails.timezone;
        existingUserShop.accessToken = encryptedToken;
        existingUserShop.scope = authResult.scope || process.env.SHOPIFY_SCOPES;
        existingUserShop.sessionId = authResult.session.id;
        existingUserShop.state = authResult.session.state;
        existingUserShop.isOnline = authResult.session.isOnline !== false;
        existingUserShop.isActive = true;
        existingUserShop.isPaused = false;
        existingUserShop.lastSyncedAt = new Date();
        existingUserShop.lastError = null;
        
        storeData = await existingUserShop.save();
        console.log('✅ Updated existing store connection for user:', authResult.userId);
      } else {
        // Create new store connection for this user
        // Note: The same shop can be connected by multiple users
        storeData = await ShopifyStore.create({
          userId: authResult.userId,
          shopDomain: authResult.shop,
          shopName: shopDetails.name,
          shopEmail: shopDetails.email,
          shopOwner: shopDetails.shop_owner,
          shopPlan: shopDetails.plan_name,
          shopCountry: shopDetails.country_name,
          shopCurrency: shopDetails.currency,
          shopTimezone: shopDetails.timezone,
          accessToken: encryptedToken,
          scope: authResult.scope || process.env.SHOPIFY_SCOPES,
          sessionId: authResult.session.id,
          state: authResult.session.state,
          isOnline: authResult.session.isOnline !== false,
          isActive: true,
          isPaused: false,
          lastSyncedAt: new Date()
        });
        console.log('✅ Created new store connection for user:', authResult.userId);
        
        // Check if other users have this shop connected (for informational purposes)
        const otherUsers = await ShopifyStore.countDocuments({
          shopDomain: authResult.shop,
          userId: { $ne: authResult.userId }
        });
        if (otherUsers > 0) {
          console.log(`ℹ️ Note: This shop is also connected to ${otherUsers} other user(s)`);
        }
      }

      console.log(`✅ Shopify store connected successfully: ${storeData.shopName} (${storeData.shopDomain})`);

      // Redirect to frontend with success
      const frontendUrl = `${process.env.FRONTEND_URL}/shopify-callback?shop=${encodeURIComponent(authResult.shop)}&success=true`;
      console.log('🔄 Redirecting to frontend:');
      console.log('  - URL:', frontendUrl);
      console.log('  - Frontend base:', process.env.FRONTEND_URL);
      return res.redirect(frontendUrl);
      
    } catch (error) {
      console.error('❌ Handle callback error:', error);
      console.error('  - Error stack:', error.stack);
      
      // Redirect to frontend with error
      const errorMessage = error.message || 'Failed to connect Shopify store';
      const frontendUrl = `${process.env.FRONTEND_URL}/shopify-callback?success=false&error=${encodeURIComponent(errorMessage)}`;
      console.log('🔄 Redirecting to frontend with error:');
      console.log('  - URL:', frontendUrl);
      return res.redirect(frontendUrl);
    }
  },

  /**
   * Get connection status
   * GET /api/shopify/auth/status
   * Returns current connection status and store info
   */
  getConnectionStatus: async (req, res) => {
    try {
      const userId = getUserId(req);
      
      if (!userId) {
        resModel.success = false;
        resModel.message = 'User authentication required';
        resModel.data = null;
        return res.status(401).json(resModel);
      }
      
      // Find active store for user
      const store = await ShopifyStore.findOne({ 
        userId, 
        isActive: true 
      }).select('shopName shopDomain shopEmail shopPlan shopCountry shopCurrency lastSyncedAt createdAt stats lastError isPaused');
      
      if (!store) {
        resModel.success = true;
        resModel.message = 'No Shopify store connected';
        resModel.data = {
          connected: false
        };
        return res.status(200).json(resModel);
      }

      // Check if access token is still valid by making a test call
      let isValid = true;
      if (store.lastError && store.lastError.code === 'INVALID_TOKEN') {
        isValid = false;
      }

      resModel.success = true;
      resModel.message = 'Connection status retrieved successfully';
      resModel.data = {
        connected: true,
        isValid,
        isPaused: store.isPaused || false,
        store: {
          shopName: store.shopName,
          shopDomain: store.shopDomain,
          shopEmail: store.shopEmail,
          shopPlan: store.shopPlan,
          shopCountry: store.shopCountry,
          shopCurrency: store.shopCurrency,
          lastSyncedAt: store.lastSyncedAt,
          connectedAt: store.createdAt,
          stats: store.stats,
          hasError: !!store.lastError,
          lastError: store.lastError
        }
      };
      return res.status(200).json(resModel);
    } catch (error) {
      console.error('Get connection status error:', error);
      resModel.success = false;
      resModel.message = error.message || 'Failed to get connection status';
      resModel.data = null;
      return res.status(500).json(resModel);
    }
  },

  /**
   * Disconnect Shopify store
   * DELETE /api/shopify/auth/disconnect
   * Removes the store connection
   */
  disconnect: async (req, res) => {
    try {
      const userId = getUserId(req);
      
      if (!userId) {
        resModel.success = false;
        resModel.message = 'User authentication required';
        resModel.data = null;
        return res.status(401).json(resModel);
      }
      
      const store = await ShopifyStore.findOne({ userId, isActive: true });
      
      if (!store) {
        resModel.success = false;
        resModel.message = 'No Shopify store connected';
        resModel.data = null;
        return res.status(404).json(resModel);
      }
      
      // Soft delete approach - deactivate and clear sensitive data
      store.isActive = false;
      store.lastError = {
        message: 'Store disconnected by user',
        code: 'USER_DISCONNECT',
        timestamp: new Date()
      };
      // Clear the access token on disconnect for security
      store.accessToken = undefined; // Use undefined instead of null
      store.sessionId = undefined; // Also clear session
      store.state = undefined;
      
      await store.save();
      
      // Option 2: Hard delete (remove completely)
      // await ShopifyStore.findOneAndDelete({ userId, shopDomain: store.shopDomain });
      
      console.log(`✅ Shopify store disconnected: ${store.shopName} (${store.shopDomain})`);
      console.log('  - isActive set to:', store.isActive);
      console.log('  - Access token and session cleared');
      
      resModel.success = true;
      resModel.message = 'Shopify store disconnected successfully';
      resModel.data = {
        disconnected: true,
        shopName: store.shopName
      };
      return res.status(200).json(resModel);
    } catch (error) {
      console.error('Disconnect error:', error);
      resModel.success = false;
      resModel.message = error.message || 'Failed to disconnect store';
      resModel.data = null;
      return res.status(500).json(resModel);
    }
  },

  /**
   * Get orders from Shopify
   * GET /api/shopify/orders
   * Query params: limit, status, createdAfter, createdBefore, fields, page_info
   */
  getOrders: async (req, res) => {
    try {
      const userId = getUserId(req);
      
      if (!userId) {
        resModel.success = false;
        resModel.message = 'User authentication required';
        resModel.data = null;
        return res.status(401).json(resModel);
      }
      
      // Get store from database
      const store = await ShopifyStore.findOne({ 
        userId, 
        isActive: true 
      });
      
      if (!store) {
        resModel.success = false;
        resModel.message = 'No Shopify store connected. Please connect your store first.';
        resModel.data = null;
        return res.status(404).json(resModel);
      }

      if (store.isPaused) {
        resModel.success = false;
        resModel.message = 'Store connection is paused. Please resume to fetch orders.';
        resModel.data = null;
        return res.status(403).json(resModel);
      }

      // Decrypt access token
      const decryptedToken = encryptionService.decrypt(store.accessToken);
      
      // Create session from stored data
      const session = shopifyService.createSessionFromStore(store, decryptedToken);
      
      // Get orders using SDK
      const { orders, pagination } = await shopifyService.getOrders(session, req.query);
      
      // Update sync timestamp and stats
      store.lastSyncedAt = new Date();
      store.lastOrderSync = new Date();
      
      if (orders && orders.length > 0) {
        // Update stats (optional)
        if (!store.stats) {
          store.stats = {};
        }
        store.stats.totalOrders = (store.stats.totalOrders || 0) + orders.length;
        store.stats.lastOrderDate = new Date(orders[0].created_at);
      }
      
      // Clear any previous errors
      store.lastError = null;
      await store.save();

      console.log(`Fetched ${orders.length} orders for store: ${store.shopName}`);

      resModel.success = true;
      resModel.message = `Successfully fetched ${orders.length} orders`;
      resModel.data = {
        orders: orders,
        count: orders.length,
        pagination: pagination,
        store: {
          shopName: store.shopName,
          shopDomain: store.shopDomain,
          shopCurrency: store.shopCurrency
        }
      };
      return res.status(200).json(resModel);
      
    } catch (error) {
      console.error('Get orders error:', error);
      
      // Save error to database for debugging
      const userId = getUserId(req);
      if (userId) {
        const store = await ShopifyStore.findOne({ userId, isActive: true });
        if (store) {
          await store.recordError(error);
        }
      }
      
      // Handle specific errors
      if (error.message?.includes('Rate limit')) {
        resModel.success = false;
        resModel.message = 'Rate limit exceeded. Please wait a few seconds and try again.';
        resModel.data = null;
        return res.status(429).json(resModel);
      }
      
      if (error.response?.status === 401) {
        resModel.success = false;
        resModel.message = 'Authentication failed. Please reconnect your Shopify store.';
        resModel.data = null;
        return res.status(401).json(resModel);
      }
      
      resModel.success = false;
      resModel.message = error.message || 'Failed to fetch orders';
      resModel.data = null;
      return res.status(500).json(resModel);
    }
  },

  /**
   * Health check endpoint
   * GET /api/shopify/health
   * Returns configuration and service status
   */
  health: async (req, res) => {
    const isConfigured = !!(
      process.env.SHOPIFY_CLIENT_ID && 
      process.env.SHOPIFY_CLIENT_SECRET &&
      process.env.SHOPIFY_APP_URL
    );
    
    resModel.success = true;
    resModel.message = 'Shopify integration health check';
    resModel.data = {
      configured: isConfigured,
      sdkVersion: '@shopify/shopify-api',
      apiVersion: process.env.SHOPIFY_API_VERSION || '2024-01',
      environment: process.env.NODE_ENV,
      timestamp: new Date().toISOString()
    };
    return res.status(200).json(resModel);
  }
};

module.exports = shopifyController;