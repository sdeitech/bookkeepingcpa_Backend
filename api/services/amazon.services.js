const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const encryptionService = require('./encryption.services');
const qs = require('qs');

class AmazonService {
  constructor() {
    this.clientId = process.env.AMAZON_CLIENT_ID;
    this.clientSecret = process.env.AMAZON_CLIENT_SECRET;
    this.redirectUri = process.env.AMAZON_REDIRECT_URI;
    this.stateCache = new Map(); // Store state tokens temporarily (in-memory)
    
    // SP-API endpoints base URLs
    this.spApiBaseUrl = 'https://sellingpartnerapi-na.amazon.com'; // North America Production
    this.spApiSandboxUrl = 'https://sandbox.sellingpartnerapi-na.amazon.com'; // North America Sandbox
    this.tokenUrl = 'https://api.amazon.com/auth/o2/token';
    this.isSandboxMode = process.env.AMAZON_SANDBOX_MODE === 'true';
  }

  /**
   * Generate OAuth authorization URL
   * @param {string} userId - User ID to associate with the state
   * @returns {Object} - Authorization URL and state token
   */
  generateAuthUrl(userId) {
    const state = uuidv4();
    
    // Store state with user ID and timestamp
    this.stateCache.set(state, { 
      userId, 
      timestamp: Date.now() 
    });
    
    // Clean old states (older than 10 minutes)
    this.cleanOldStates();

    // Build authorization URL according to Amazon documentation
    const params = new URLSearchParams({
      application_id: this.clientId,
      state: state,
      redirect_uri: this.redirectUri,
      scope: 'profile' // Required scope for SP API
    });

    return {
      url: `https://sellercentral.amazon.com/apps/authorize/consent?${params.toString()}`,
      state
    };
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
      throw new Error('State parameter has expired');
    }
    
    return stateData;
  }

  /**
   * Exchange authorization code for tokens
   * @param {string} code - Authorization code from Amazon
   * @param {string} state - State parameter for validation
   * @returns {Object} - Access token, refresh token, and user ID
   */
  async exchangeCodeForTokens(code, state) {
    // Validate state
    const stateData = this.validateState(state);
    
    // Remove state from cache after validation
    this.stateCache.delete(state);

    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.redirectUri,
      client_id: this.clientId,
      client_secret: this.clientSecret
    });

    try {
      const response = await axios.post(this.tokenUrl, params, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      return {
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token,
        expiresIn: response.data.expires_in,
        tokenType: response.data.token_type,
        userId: stateData.userId
      };
    } catch (error) {
      console.error('Token exchange error:', error.response?.data || error.message);
      throw new Error(`Token exchange failed: ${error.response?.data?.error_description || error.message}`);
    }
  }

  /**
   * Refresh access token using refresh token
   * @param {string} refreshToken - Refresh token
   * @returns {Object} - New access token and expiry
   */
  async refreshAccessToken(refreshToken) {
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: this.clientId,
      client_secret: this.clientSecret
    });

    try {
      const response = await axios.post(this.tokenUrl, params, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      return {
        accessToken: response.data.access_token,
        expiresIn: response.data.expires_in,
        tokenType: response.data.token_type
      };
    } catch (error) {
      console.error('Token refresh error:', error.response?.data || error.message);
      throw new Error(`Token refresh failed: ${error.response?.data?.error_description || error.message}`);
    }
  }

  /**
   * Get seller profile information
   * @param {string} accessToken - Access token
   * @returns {Object} - Seller profile data
   */
  async getSellerProfile(accessToken) {
    try {
      const response = await axios.get('https://api.amazon.com/user/profile', {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      return {
        sellerId: response.data.user_id,
        sellerEmail: response.data.email,
        sellerName: response.data.name
      };
    } catch (error) {
      console.error('Get profile error:', error.response?.data || error.message);
      throw new Error(`Failed to get seller profile: ${error.message}`);
    }
  }

  /**
   * Make SP-API request with OAuth token (NO IAM/SigV4 required!)
   * @param {string} accessToken - Decrypted access token
   * @param {Object} options - Request options
   * @param {boolean} isSandbox - Whether to use sandbox endpoints
   * @returns {Object} - API response
   */
  async makeSpApiRequest(accessToken, options, isSandbox = false) {
    const { method = 'GET', endpoint, path = '', params = {}, body = null } = options;
    
    // Use sandbox URL if in sandbox mode or explicitly requested
    const baseUrl = (isSandbox || this.isSandboxMode) ? this.spApiSandboxUrl : this.spApiBaseUrl;
    
    // Construct full URL
    const url = `${baseUrl}${endpoint}${path}`;
    
    try {
      const config = {
        method,
        url,
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'x-amz-access-token': accessToken // SP-API specific header
        },
        params
      };

      if (body) {
        config.data = body;
      }

      const response = await axios(config);
      return response.data;
    } catch (error) {
      console.error(`SP-API request error for ${endpoint}:`, error.response?.data || error.message);
      
      // Check if token expired
      if (error.response?.status === 401) {
        throw new Error('Access token expired. Please refresh token.');
      }
      
      throw new Error(`SP-API request failed: ${error.response?.data?.errors?.[0]?.message || error.message}`);
    }
  }

  /**
   * Get marketplace participation
   * @param {string} accessToken - Decrypted access token
   * @returns {Array} - List of marketplaces
   */
  async getMarketplaceParticipation(accessToken) {
    try {
      const response = await this.makeSpApiRequest(accessToken, {
        endpoint: '/sellers/v1/marketplaceParticipations'
      });

      if (response && response.payload) {
        return response.payload.map(participation => ({
          marketplaceId: participation.marketplace.id,
          marketplaceName: participation.marketplace.name,
          countryCode: participation.marketplace.countryCode,
          defaultCurrencyCode: participation.marketplace.defaultCurrencyCode,
          defaultLanguageCode: participation.marketplace.defaultLanguageCode,
          domainName: participation.marketplace.domainName
        }));
      }

      return [];
    } catch (error) {
      console.error('Get marketplace participation error:', error);
      throw new Error(`Failed to get marketplace participation: ${error.message}`);
    }
  }

  /**
   * Get orders from Amazon
   * @param {string} accessToken - Decrypted access token
   * @param {Object} params - Query parameters
   * @param {boolean} isSandbox - Whether to use sandbox endpoints
   * @returns {Object} - Orders data
   */
  async getOrders(accessToken, params = {}, isSandbox = false) {
    try {
      // For sandbox, use the test parameters that Amazon sandbox expects
      let queryParams;
      
      if (isSandbox) {
        // Amazon sandbox requires specific parameters
       queryParams = {
        MarketplaceIds:['ATVPDKIKX0DER'],	 // Must be array
        CreatedAfter: '2022-02-01T00:00:00Z', // Valid ISO 8601 date
        MaxResultsPerPage: 10 // Correct parameter name for sandbox
      };
      } else {
        queryParams = {
          MarketplaceIds: params.marketplaceIds?.join(',') || 'ATVPDKIKX0DER',
          CreatedAfter: params.createdAfter || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          MaxResultsPerPage: params.maxResults || 100
        };

        if (params.orderStatuses) {
          queryParams.OrderStatuses = params.orderStatuses.join(',');
        }
      }

      console.log("actual params",queryParams);

      const response = await this.makeSpApiRequest(accessToken, {
        endpoint: '/orders/v0/orders',
        params: queryParams
      }, isSandbox);

      console.log("response for sandbox",response);

      return response;
    } catch (error) {
      console.error('Get orders error:', error);
      throw new Error(`Failed to get orders: ${error.message}`);
    }
  }

  /**
   * Get inventory summaries
   * @param {string} accessToken - Decrypted access token
   * @param {Object} params - Query parameters
   * @param {boolean} isSandbox - Whether to use sandbox endpoints
   * @returns {Object} - Inventory data
   */
  async getInventory(accessToken, params = {}, isSandbox = false) {
    try {
      let queryParams;
      
      if (isSandbox) {
        // Sandbox expects specific parameters
        queryParams = {
          marketplaceIds: 'ATVPDKIKX0DER',
          details: false,
          granularityType: 'Marketplace',
          granularityId: 'ATVPDKIKX0DER'
        };
      } else {
        queryParams = {
          marketplaceIds: params.marketplaceIds?.join(',') || 'ATVPDKIKX0DER',
          details: true
        };

        if (params.skus) {
          queryParams.sellerSkus = params.skus.join(',');
        }
      }

      const response = await this.makeSpApiRequest(accessToken, {
        endpoint: '/fba/inventory/v1/summaries',
        params: queryParams
      }, isSandbox);

      return response;
    } catch (error) {
      console.error('Get inventory error:', error);
      throw new Error(`Failed to get inventory: ${error.message}`);
    }
  }

  /**
   * Get financial events
   * @param {string} accessToken - Decrypted access token
   * @param {Object} params - Query parameters
   * @returns {Object} - Financial data
   */
  async getFinancialEvents(accessToken, params = {}) {
    try {
      const queryParams = {
        PostedAfter: params.postedAfter || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        MaxResultsPerPage: params.maxResults || 100
      };

      if (params.postedBefore) {
        queryParams.PostedBefore = params.postedBefore;
      }

      const response = await this.makeSpApiRequest(accessToken, {
        endpoint: '/finances/v0/financialEvents',
        params: queryParams
      });

      return response;
    } catch (error) {
      console.error('Get financial events error:', error);
      throw new Error(`Failed to get financial events: ${error.message}`);
    }
  }

  /**
   * Create report request
   * @param {string} accessToken - Decrypted access token
   * @param {Object} params - Report parameters
   * @returns {Object} - Report request data
   */
  async createReport(accessToken, params) {
    try {
      const body = {
        reportType: params.reportType,
        marketplaceIds: params.marketplaceIds || ['ATVPDKIKX0DER']
      };

      if (params.dataStartTime) {
        body.dataStartTime = params.dataStartTime;
      }
      if (params.dataEndTime) {
        body.dataEndTime = params.dataEndTime;
      }

      const response = await this.makeSpApiRequest(accessToken, {
        method: 'POST',
        endpoint: '/reports/2021-06-30/reports',
        body
      });

      return response;
    } catch (error) {
      console.error('Create report error:', error);
      throw new Error(`Failed to create report: ${error.message}`);
    }
  } 

  /**
   * Get report document
   * @param {string} accessToken - Decrypted access token
   * @param {string} reportDocumentId - Report document ID
   * @returns {Object} - Report document data
   */
  async getReportDocument(accessToken, reportDocumentId) {
    try {
      const response = await this.makeSpApiRequest(accessToken, {
        endpoint: `/reports/2021-06-30/documents/${reportDocumentId}`
      });

      return response;
    } catch (error) {
      console.error('Get report document error:', error);
      throw new Error(`Failed to get report document: ${error.message}`);
    }
  }

  /**
   * Get catalog item
   * @param {string} accessToken - Decrypted access token
   * @param {string} asin - Product ASIN
   * @returns {Object} - Product data
   */
  async getCatalogItem(accessToken, asin) {
    try {
      const response = await this.makeSpApiRequest(accessToken, {
        endpoint: `/catalog/2022-04-01/items/${asin}`,
        params: {
          marketplaceIds: 'ATVPDKIKX0DER',
          includedData: 'summaries,attributes,images,salesRanks'
        }
      });

      return response;
    } catch (error) {
      console.error('Get catalog item error:', error);
      throw new Error(`Failed to get catalog item: ${error.message}`);
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
}

// Export singleton instance
module.exports = new AmazonService();