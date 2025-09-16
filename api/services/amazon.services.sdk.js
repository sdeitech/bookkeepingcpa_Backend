const SellingPartnerAPI = require('amazon-sp-api');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

/**
 * Amazon SP-API Service using the official SDK
 * Following documentation: https://www.npmjs.com/package/amazon-sp-api
 */
class AmazonServiceSDK {
  constructor() {
    // OAuth flow credentials
    this.clientId = process.env.SELLING_PARTNER_APP_CLIENT_ID || process.env.LWA_APP_ID;
    this.clientSecret = process.env.SELLING_PARTNER_APP_CLIENT_SECRET || process.env.LWA_CLIENT_SECRET;
    this.redirectUri = process.env.AMAZON_REDIRECT_URI;
    this.stateCache = new Map();

    this.tokenUrl = 'https://api.amazon.com/auth/o2/token';
    this.isSandboxMode = process.env.AMAZON_SANDBOX_MODE === 'true';
  }

  /**
   * Get SP-API client instance - following SDK documentation
   */
  async getSPAPIClient(refreshToken) {
    try {
      // Create client with minimal config - SDK reads env vars automatically
      const spClient = new SellingPartnerAPI({
        region: 'na',
        refresh_token: refreshToken,
        options: {
          use_sandbox: this.isSandboxMode
        }
      });

      return spClient;
    } catch (error) {
      console.error('Error creating SP-API client:', error);
      throw error;
    }
  }

  /**
   * Generate OAuth authorization URL
   */
  generateAuthUrl(userId) {
    const state = uuidv4();

    this.stateCache.set(state, {
      userId,
      timestamp: Date.now()
    });

    this.cleanOldStates();

    const params = new URLSearchParams({
      application_id: this.clientId,
      state: state,
      redirect_uri: this.redirectUri,
      scope: 'profile'
    });

    return {
      url: `https://sellercentral.amazon.com/apps/authorize/consent?${params.toString()}`,
      state
    };
  }

  /**
   * Validate state token
   */
  validateState(state) {
    const stateData = this.stateCache.get(state);

    if (!stateData) {
      throw new Error('Invalid or expired state parameter');
    }

    const tenMinutesAgo = Date.now() - (10 * 60 * 1000);
    if (stateData.timestamp < tenMinutesAgo) {
      this.stateCache.delete(state);
      throw new Error('State parameter has expired');
    }

    return stateData;
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCodeForTokens(code, state) {
    const stateData = this.validateState(state);
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
   * Refresh access token using SDK
   */
  async refreshAccessToken(refreshToken) {
    try {
      const spClient = await this.getSPAPIClient(refreshToken);
      const tokens = await spClient.refreshAccessToken();

      return {
        accessToken: tokens.access_token,
        expiresIn: tokens.expires_in || 3600,
        tokenType: 'Bearer'
      };
    } catch (error) {
      console.error('Token refresh error:', error);

      // Fallback to direct API call
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
          tokenType: response.data.token_type || 'Bearer'
        };
      } catch (axiosError) {
        console.error('Direct token refresh error:', axiosError.response?.data || axiosError.message);
        throw new Error(`Token refresh failed: ${axiosError.response?.data?.error_description || axiosError.message}`);
      }
    }
  }

  /**
   * Get seller profile - following SDK documentation pattern
   */
  async getSellerProfile(refreshToken) {
    try {
      const spClient = await this.getSPAPIClient(refreshToken);

      // Using the exact SDK pattern
      const res = await spClient.callAPI({
        operation: 'getMarketplaceParticipations',
        endpoint: 'sellers'
      });

      if (res && res.payload && res.payload.length > 0) {
        const participation = res.payload[0].participation;
        return {
          sellerId: participation.sellerId,
          isParticipating: participation.isParticipating,
          hasSuspendedListings: participation.hasSuspendedListings
        };
      }

      return {
        sellerId: 'Unknown',
        isParticipating: false,
        hasSuspendedListings: false
      };
    } catch (error) {
      console.error('Get profile error:', error);
      throw new Error(`Failed to get seller profile: ${error.message}`);
    }
  }

  /**
   * Get marketplace participation - following SDK documentation pattern
   */
  async getMarketplaceParticipation(refreshToken) {
    try {
      const spClient = await this.getSPAPIClient(refreshToken);

      const res = await spClient.callAPI({
        operation: 'getMarketplaceParticipations',
        endpoint: 'sellers'
      });

      if (res && res.payload) {
        return res.payload.map(item => ({
          marketplaceId: item.marketplace.id,
          marketplaceName: item.marketplace.name,
          countryCode: item.marketplace.countryCode,
          defaultCurrencyCode: item.marketplace.defaultCurrencyCode,
          defaultLanguageCode: item.marketplace.defaultLanguageCode,
          domainName: item.marketplace.domainName,
          sellerId: item.participation.sellerId,
          isParticipating: item.participation.isParticipating
        }));
      }

      return [];
    } catch (error) {
      console.error('Get marketplace participation error:', error);
      throw new Error(`Failed to get marketplace participation: ${error.message}`);
    }
  }

  /**
   * Get orders - accepts access token for immediate use, refresh token for SDK client
   */
  async getOrders(access_token, params = {}, refreshToken) {
    try {
      if (!refreshToken) {
        throw new Error('Refresh token is required for SDK');
      }


      const spClient = new SellingPartnerAPI({
        region: 'na',
        refresh_token: refreshToken,
        access_token: access_token,
        credentials: {
          SELLING_PARTNER_APP_CLIENT_ID: process.env.SELLING_PARTNER_APP_CLIENT_ID,
          SELLING_PARTNER_APP_CLIENT_SECRET: process.env.SELLING_PARTNER_APP_CLIENT_SECRET
        },
        options: {
          use_sandbox: this.isSandboxMode,
          debug_log: true,
          sandbox: true
        }
      });
      console.log("sp client", spClient);

      const res = await spClient.callAPI({
        operation: 'getOrders',
        endpoint: 'orders',
        query: params

      });

      console.log('Orders response:', res);
      return res;
    } catch (error) {
      console.error('Get orders error:', error);
      throw new Error(`Failed to get orders: ${error.message}`);
    }
  }


  /**
   * Get inventory - accepts access token for immediate use, refresh token for SDK client
   */
  async getInventory(accessToken, params = {}, refreshToken = null) {
    try {
      // If we have a refresh token, use SDK with it
      if (refreshToken) {
        // Create SDK client with refresh token AND access token
        const spClient = new SellingPartnerAPI({
          region: 'na',
          refresh_token: refreshToken,
          access_token: accessToken,
          options: {
            sandbox: this.isSandboxMode
          }
        });
        console.log("splclient", spClient);

        // Following the exact SDK pattern
        const res = await spClient.callAPI({
          operation: 'getInventorySummaries',
          endpoint: 'fbaInventory',
          query: {
            details: true,
            granularityType: 'Marketplace',
            granularityId: params.marketplaceId || 'ATVPDKIKX0DER',
            marketplaceIds: params.marketplaceIds || ['ATVPDKIKX0DER'],
            ...(params.skus && { sellerSkus: params.skus }),
            ...(params.nextToken && { nextToken: params.nextToken })
          }
        });

        console.log('Inventory response:', res);
        return res;
      } else {
        // Fallback to direct API call with access token if no refresh token
        throw new Error('Refresh token is required for SDK');
      }
    } catch (error) {
      console.error('Get inventory error:', error);
      throw new Error(`Failed to get inventory: ${error.message}`);
    }
  }

  /**
   * Get financial events - following SDK documentation pattern
   */
  async getFinancialEvents(refreshToken, params = {}) {
    try {
      const spClient = await this.getSPAPIClient(refreshToken);

      const res = await spClient.callAPI({
        operation: 'listFinancialEvents',
        endpoint: 'finances',
        query: {
          PostedAfter: params.postedAfter || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          MaxResultsPerPage: params.maxResults || 100,
          ...(params.postedBefore && { PostedBefore: params.postedBefore }),
          ...(params.nextToken && { NextToken: params.nextToken })
        }
      });

      return res;
    } catch (error) {
      console.error('Get financial events error:', error);
      throw new Error(`Failed to get financial events: ${error.message}`);
    }
  }

  /**
   * Create report - following SDK documentation pattern
   */
  async createReport(refreshToken, params) {
    try {
      const spClient = await this.getSPAPIClient(refreshToken);

      const res = await spClient.callAPI({
        operation: 'createReport',
        endpoint: 'reports',
        body: {
          reportType: params.reportType,
          marketplaceIds: params.marketplaceIds || ['ATVPDKIKX0DER'],
          ...(params.dataStartTime && { dataStartTime: params.dataStartTime }),
          ...(params.dataEndTime && { dataEndTime: params.dataEndTime })
        }
      });

      return res;
    } catch (error) {
      console.error('Create report error:', error);
      throw new Error(`Failed to create report: ${error.message}`);
    }
  }

  /**
   * Get report document - following SDK documentation pattern
   */
  async getReportDocument(refreshToken, reportDocumentId) {
    try {
      const spClient = await this.getSPAPIClient(refreshToken);

      const res = await spClient.callAPI({
        operation: 'getReportDocument',
        endpoint: 'reports',
        path: {
          reportDocumentId
        }
      });

      // Download report content if URL provided
      if (res && res.url) {
        const reportContent = await spClient.download({
          url: res.url,
          json: true
        });
        res.content = reportContent;
      }

      return res;
    } catch (error) {
      console.error('Get report document error:', error);
      throw new Error(`Failed to get report document: ${error.message}`);
    }
  }

  /**
   * Get catalog item - following SDK documentation pattern
   */
  async getCatalogItem(refreshToken, asin, marketplaceId = 'ATVPDKIKX0DER') {
    try {
      const spClient = await this.getSPAPIClient(refreshToken);

      const res = await spClient.callAPI({
        operation: 'getCatalogItem',
        endpoint: 'catalogItems',
        path: {
          asin
        },
        query: {
          MarketplaceId: marketplaceId,
          includedData: ['attributes', 'images', 'productTypes', 'salesRanks', 'summaries', 'variations']
        }
      });

      return res;
    } catch (error) {
      console.error('Get catalog item error:', error);
      throw new Error(`Failed to get catalog item: ${error.message}`);
    }
  }

  /**
   * Get order items - following SDK documentation pattern
   */
  async getOrderItems(refreshToken, orderId) {
    try {
      const spClient = await this.getSPAPIClient(refreshToken);

      const res = await spClient.callAPI({
        operation: 'getOrderItems',
        endpoint: 'orders',
        path: {
          orderId
        }
      });

      return res;
    } catch (error) {
      console.error('Get order items error:', error);
      throw new Error(`Failed to get order items: ${error.message}`);
    }
  }

  /**
   * Get order - following SDK documentation pattern
   */
  async getOrder(refreshToken, orderId) {
    try {
      const spClient = await this.getSPAPIClient(refreshToken);

      const res = await spClient.callAPI({
        operation: 'getOrder',
        endpoint: 'orders',
        path: {
          orderId
        }
      });

      return res;
    } catch (error) {
      console.error('Get order error:', error);
      throw new Error(`Failed to get order: ${error.message}`);
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
module.exports = new AmazonServiceSDK();