// Import Node.js adapter first (required for runtime)
require('@shopify/shopify-api/adapters/node');
const { shopifyApi, ApiVersion, Session } = require('@shopify/shopify-api');
const { v4: uuidv4 } = require('uuid');

class ShopifyService {
  constructor() {
    // Initialize Shopify API with configuration for PUBLIC APP (standard OAuth)
    this.shopify = shopifyApi({
      apiKey: process.env.SHOPIFY_CLIENT_ID,
      apiSecretKey: process.env.SHOPIFY_CLIENT_SECRET,
      scopes: process.env.SHOPIFY_SCOPES?.split(',') || ['read_orders'],
      hostName: process.env.SHOPIFY_APP_URL?.replace(/https?:\/\//, '') || 'localhost:8080',
      apiVersion: process.env.SHOPIFY_API_VERSION || '2024-01',
      isEmbeddedApp: false,
      isCustomStoreApp: false, // FALSE for standard OAuth (Public App)
      // Suppress informational messages about future flags
      logger: {
        level: 'error', // Only show errors, not info messages
      }
    });
    
    // Store state tokens temporarily (in production, use Redis or database)
    this.stateCache = new Map();
    
    console.log(`🏪 Shopify Service initialized for Standard OAuth (Public App)`);
    console.log(`📍 Redirect URI: ${process.env.SHOPIFY_APP_URL}/api/shopify/auth/callback`);
  }

  /**
   * Generate OAuth authorization URL
   * @param {string} shop - Shop domain (e.g., mystore.myshopify.com)
   * @param {string} userId - User ID to associate with this connection
   * @returns {Object} - Authorization URL and state
   */
  async generateAuthUrl(shop, userId) {
    try {
      // Sanitize shop domain
      const sanitizedShop = this.shopify.utils.sanitizeShop(shop);
      
      if (!sanitizedShop) {
        throw new Error('Invalid shop domain. Please provide a valid .myshopify.com domain');
      }

      // Generate unique state token
      const state = uuidv4();
      
      // Store state with user ID and timestamp
      this.stateCache.set(state, {
        userId,
        shop: sanitizedShop,
        timestamp: Date.now()
      });
      
      // Clean old states
      this.cleanOldStates();

      // Build authorization URL manually since we don't have a real request object
      // Use the ngrok URL if available, otherwise use the configured app URL
      const appUrl = process.env.NGROK_URL || process.env.SHOPIFY_APP_URL || 'http://localhost:8080';
      const redirectUri = `${appUrl}/api/shopify/auth/callback`;
      const scopes = process.env.SHOPIFY_SCOPES || 'read_orders';
      const clientId = process.env.SHOPIFY_CLIENT_ID;

      if (!clientId) {
        throw new Error('SHOPIFY_CLIENT_ID is not configured');
      }

      // Construct OAuth authorization URL
      const authUrl = `https://${sanitizedShop}/admin/oauth/authorize?` +
        `client_id=${clientId}&` +
        `scope=${scopes}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `state=${state}&` +
        `grant_options[]=per-user`;
      
      console.log('Generated redirect URI:', redirectUri);
      
      console.log('Generated auth URL for shop:', sanitizedShop);
      
      return {
        url: authUrl,
        state
      };
    } catch (error) {
      console.error('Error generating auth URL:', error);
      throw new Error(`Failed to generate authorization URL: ${error.message}`);
    }
  }

  /**
   * Validate state token
   * @param {string} state - State token to validate
   * @returns {Object} - State data if valid
   */
  validateState(state) {
    const stateData = this.stateCache.get(state);
    
    if (!stateData) {
      throw new Error('Invalid or expired state parameter');
    }
    
    // Check if state is older than 10 minutes
    const tenMinutesAgo = Date.now() - (10 * 60 * 1000);
    if (stateData.timestamp < tenMinutesAgo) {
      this.stateCache.delete(state);
      throw new Error('State parameter has expired. Please try again.');
    }
    
    return stateData;
  }

  /**
   * Complete OAuth process and exchange code for token
   * Standard OAuth flow with state parameter for userId tracking
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Object} - Session data with userId, shop, token, etc.
   */
  async completeAuth(req, res) {
    try {
      const { shop, code, state, timestamp, signature, hmac } = req.query;
      
      console.log('🔐 Shopify OAuth Callback (Standard Flow):');
      console.log('  - Shop:', shop);
      console.log('  - Code:', code ? 'Present' : 'Missing');
      console.log('  - State:', state ? 'Present' : 'Missing');
      console.log('  - HMAC:', hmac ? 'Present' : 'Missing');
      
      // Validate required parameters for standard OAuth
      if (!code || !shop || !state) {
        throw new Error('Missing required OAuth parameters. Please initiate connection from the app.');
      }
      
      // HMAC Verification (Required for security)
      if (hmac && !this.verifyHmac(req.query)) {
        console.error('❌ HMAC verification failed');
        throw new Error('Security verification failed. The request signature is invalid.');
      }
      
      // Get userId from state parameter (standard OAuth flow)
      let userId = null;
      try {
        const stateData = this.validateState(state);
        userId = stateData.userId;
        console.log('✅ UserId retrieved from state:', userId);
        
        // Clean up state after use
        this.stateCache.delete(state);
      } catch (stateError) {
        console.error('❌ State validation failed:', stateError.message);
        throw new Error('Invalid or expired state. Please try connecting again.');
      }
      
      if (!userId || userId === 'pending' || userId === 'unknown') {
        throw new Error('Invalid user session. Please log in and try connecting again.');
      }
      
      // Remove state from cache if it exists
      if (state) {
        this.stateCache.delete(state);
      }

      // Exchange code for access token using direct HTTP request
      const axios = require('axios');
      
      console.log('Exchanging code for access token...');
      const tokenUrl = `https://${shop}/admin/oauth/access_token`;
      
      const tokenResponse = await axios.post(tokenUrl, {
        client_id: process.env.SHOPIFY_CLIENT_ID,
        client_secret: process.env.SHOPIFY_CLIENT_SECRET,
        code: code
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });

      const { access_token, scope, associated_user_scope, associated_user } = tokenResponse.data;
      
      console.log('✅ Access token obtained successfully');

      // Create session
      const sessionId = this.shopify.session.getOfflineId(shop);
      const session = new Session({
        id: sessionId,
        shop,
        state: 'active',
        isOnline: false,
        accessToken: access_token,
        scope: scope || associated_user_scope
      });

      return {
        session,
        userId: userId, // Use the userId we determined above
        shop,
        accessToken: access_token,
        scope: scope || associated_user_scope
      };
    } catch (error) {
      console.error('OAuth callback error:', error);
      throw new Error(`OAuth callback failed: ${error.message}`);
    }
  }

  /**
   * Create session object from stored data
   * @param {Object} storeData - Data from database
   * @returns {Session} - Shopify Session object
   */
  createSessionFromStore(storeData, decryptedToken) {
    return new Session({
      id: storeData.sessionId || `offline_${storeData.shopDomain}`,
      shop: storeData.shopDomain,
      state: storeData.state || 'active',
      isOnline: storeData.isOnline !== false,
      accessToken: decryptedToken,
      scope: storeData.scope
    });
  }

  /**
   * Get shop details
   * @param {Session} session - Shopify session
   * @returns {Object} - Shop information
   */
  async getShopDetails(session) {
    try {
      const client = new this.shopify.clients.Rest({ 
        session,
        apiVersion: this.shopify.config.apiVersion 
      });
      
      const response = await client.get({
        path: 'shop'
      });

      return response.body.shop;
    } catch (error) {
      console.error('Error fetching shop details:', error);
      throw new Error(`Failed to fetch shop details: ${error.message}`);
    }
  }

  /**
   * Get orders from Shopify
   * @param {Session} session - Shopify session
   * @param {Object} queryParams - Query parameters
   * @returns {Array} - Array of orders
   */
  async getOrders(session, queryParams = {}) {
    try {
      const client = new this.shopify.clients.Rest({ 
        session,
        apiVersion: this.shopify.config.apiVersion 
      });
      
      // Build query parameters
      const params = {
        limit: queryParams.limit || 50,
        status: queryParams.status || 'any'
      };

      // Add optional date filters
      if (queryParams.createdAfter) {
        params.created_at_min = queryParams.createdAfter;
      }
      if (queryParams.createdBefore) {
        params.created_at_max = queryParams.createdBefore;
      }
      if (queryParams.fields) {
        params.fields = queryParams.fields;
      }
      if (queryParams.page_info) {
        params.page_info = queryParams.page_info;
      }

      console.log('Fetching orders with params:', params);

      const response = await client.get({
        path: 'orders',
        query: params
      });

      // Extract pagination info from headers
      const linkHeader = response.headers?.link || '';
      const pageInfo = this.extractPageInfo(linkHeader);

      return {
        orders: response.body.orders || [],
        pagination: pageInfo
      };
    } catch (error) {
      console.error('Error fetching orders:', error);
      
      // Handle rate limiting
      if (error.response?.status === 429) {
        throw new Error('Rate limit exceeded. Please try again in a few seconds.');
      }
      
      throw new Error(`Failed to fetch orders: ${error.message}`);
    }
  }

  /**
   * Extract pagination info from Link header
   * @param {string} linkHeader - Link header from response
   * @returns {Object} - Pagination info
   */
  extractPageInfo(linkHeader) {
    const pageInfo = {};
    
    if (!linkHeader) return pageInfo;

    // Parse Link header for pagination
    const links = linkHeader.split(',');
    links.forEach(link => {
      const match = link.match(/<[^>]*[?&]page_info=([^>&]*)[^>]*>;\s*rel="([^"]*)"/)
      if (match) {
        const [, token, rel] = match;
        pageInfo[rel] = token;
      }
    });

    return pageInfo;
  }

  /**
   * Validate webhook signature
   * @param {string} rawBody - Raw request body
   * @param {string} signature - HMAC signature from header
   * @returns {boolean} - True if valid
   */
  validateWebhook(rawBody, signature) {
    try {
      // For Shopify webhooks, the signature is in the X-Shopify-Hmac-Sha256 header
      const crypto = require('crypto');
      const expectedSignature = crypto
        .createHmac('sha256', process.env.SHOPIFY_WEBHOOK_SECRET || process.env.SHOPIFY_CLIENT_SECRET)
        .update(rawBody, 'utf8')
        .digest('base64');
      
      return expectedSignature === signature;
    } catch (error) {
      console.error('Webhook validation error:', error);
      return false;
    }
  }
  
  /**
   * Verify HMAC signature for security (Shopify requirement)
   * @param {Object} queryParams - Query parameters from callback
   * @returns {boolean} - True if HMAC is valid
   */
  verifyHmac(queryParams) {
    const { hmac, signature, ...params } = queryParams;
    
    if (!hmac || !process.env.SHOPIFY_CLIENT_SECRET) {
      console.log('⚠️ HMAC verification skipped (missing hmac or secret)');
      return true; // Skip if no HMAC provided (development only)
    }
    
    // Build message from sorted query parameters
    const message = Object.keys(params)
      .sort()
      .map(key => `${key}=${params[key]}`)
      .join('&');
    
    // Calculate expected HMAC
    const crypto = require('crypto');
    const expectedHmac = crypto
      .createHmac('sha256', process.env.SHOPIFY_CLIENT_SECRET)
      .update(message, 'utf8')
      .digest('hex');
    
    const isValid = expectedHmac === hmac;
    
    if (!isValid) {
      console.error('❌ HMAC mismatch:');
      console.error('  Expected:', expectedHmac);
      console.error('  Received:', hmac);
    } else {
      console.log('✅ HMAC verification passed');
    }
    
    return isValid;
  }

  /**
   * Register webhook (for future use)
   * @param {Session} session - Shopify session
   * @param {string} topic - Webhook topic (e.g., 'ORDERS_CREATE')
   * @param {string} webhookUrl - URL to receive webhook
   * @returns {Object} - Webhook registration response
   */
  async registerWebhook(session, topic, webhookUrl) {
    try {
      const response = await this.shopify.webhooks.register({
        session,
        topic,
        path: webhookUrl
      });
      
      return response;
    } catch (error) {
      console.error('Webhook registration error:', error);
      throw new Error(`Failed to register webhook: ${error.message}`);
    }
  }

  /**
   * Clean old state tokens from cache
   */
  cleanOldStates() {
    const tenMinutesAgo = Date.now() - (10 * 60 * 1000);
    
    for (const [state, data] of this.stateCache.entries()) {
      if (data.timestamp < tenMinutesAgo) {
        this.stateCache.delete(state);
      }
    }
  }

  /**
   * Test connection with a simple API call
   * @param {Session} session - Shopify session
   * @returns {boolean} - True if connection is valid
   */
  async testConnection(session) {
    try {
      await this.getShopDetails(session);
      return true;
    } catch (error) {
      console.error('Connection test failed:', error);
      return false;
    }
  }
  
  /**
   * Helper method to get a user-friendly error message
   * @param {Error} error - The error object
   * @returns {string} - User-friendly error message
   */
  getUserFriendlyError(error) {
    // Map technical errors to user-friendly messages
    const errorMap = {
      'Invalid shop domain': 'Please enter a valid Shopify store URL (e.g., store-name.myshopify.com)',
      'Authentication required': 'Please log in before connecting your Shopify store',
      'Invalid or expired state': 'Your session has expired. Please try connecting again',
      'HMAC validation failed': 'Security check failed. Please try again',
      'Rate limit exceeded': 'Too many requests. Please wait a moment and try again',
      'Invalid token': 'Your Shopify connection has expired. Please reconnect your store',
      'Missing required parameters': 'Some required information is missing. Please try again'
    };
    
    // Check if error message contains any of our known patterns
    const errorMessage = error.message || '';
    for (const [pattern, friendlyMessage] of Object.entries(errorMap)) {
      if (errorMessage.includes(pattern)) {
        return friendlyMessage;
      }
    }
    
    // Default message
    return 'An error occurred while connecting to Shopify. Please try again.';
  }
}

// Export singleton instance
module.exports = new ShopifyService();
