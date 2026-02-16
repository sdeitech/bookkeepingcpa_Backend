const OAuthClient = require('intuit-oauth');
const { v4: uuidv4 } = require('uuid');

class QuickBooksService {
  constructor() {
    // Initialize OAuth client based on official documentation
    // https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization/oauth-2.0
    this.oauthClient = new OAuthClient({
      clientId: process.env.QUICKBOOKS_CLIENT_ID,
      clientSecret: process.env.QUICKBOOKS_CLIENT_SECRET,
      environment: process.env.QUICKBOOKS_ENVIRONMENT || 'sandbox',
      redirectUri: process.env.QUICKBOOKS_REDIRECT_URI,
      logging: process.env.NODE_ENV === 'development' // Enable logging in development
    });

    // API base URL depends on environment
    this.apiBaseUrl = process.env.QUICKBOOKS_ENVIRONMENT === 'production'
      ? 'https://quickbooks.api.intuit.com'
      : 'https://sandbox-quickbooks.api.intuit.com';

    console.log('🏢 QuickBooks Service initialized');
    console.log('📍 Environment:', process.env.QUICKBOOKS_ENVIRONMENT || 'sandbox');
    console.log('📍 Redirect URI:', process.env.QUICKBOOKS_REDIRECT_URI);
  }

  /**
   * Generate OAuth authorization URL
   * Based on: https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization/oauth-2.0#step-2-redirect-user-to-the-authorization-page
   */
  generateAuthUrl(userId) {
    const state = uuidv4();
    const scopes = process.env.QUICKBOOKS_SCOPES?.split(' ') || [
      OAuthClient.scopes.Accounting,
      OAuthClient.scopes.OpenId,
      OAuthClient.scopes.Profile,
      OAuthClient.scopes.Email,
      OAuthClient.scopes.Phone,
      OAuthClient.scopes.Address
    ];

    const authUri = this.oauthClient.authorizeUri({
      scope: scopes,
      state: `${userId}:${state}`
    });

    console.log('🔗 Generated QuickBooks auth URL');
    console.log('📍 Scopes:', scopes.join(' '));

    return {
      url: authUri,
      state: `${userId}:${state}`
    };
  }

  /**
   * Exchange authorization code for tokens
   * Based on: https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization/oauth-2.0#step-3-exchange-the-authorization-code-for-tokens
   */
  async exchangeCodeForTokens(code, realmId = null, state = null) {
    try {
      console.log('🔄 Attempting token exchange with code:', code ? 'Present' : 'Missing');
      console.log('📍 Code value:', code);
      console.log('📍 Realm ID:', realmId || 'Not provided');
      console.log('📍 State:', state || 'Not provided');
      console.log('📍 OAuth Client Config:');
      console.log('  - Client ID:', process.env.QUICKBOOKS_CLIENT_ID ? 'Present' : 'Missing');
      console.log('  - Client Secret:', process.env.QUICKBOOKS_CLIENT_SECRET ? 'Present' : 'Missing');
      console.log('  - Redirect URI:', process.env.QUICKBOOKS_REDIRECT_URI);
      console.log('  - Environment:', process.env.QUICKBOOKS_ENVIRONMENT || 'sandbox');

      // Manual token exchange using axios (bypassing intuit-oauth library issue)
      const axios = require('axios');
      const qs = require('querystring');

      console.log('📍 Performing manual OAuth 2.0 token exchange');

      // Prepare the token exchange request
      const tokenEndpoint = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
      const credentials = Buffer.from(`${process.env.QUICKBOOKS_CLIENT_ID}:${process.env.QUICKBOOKS_CLIENT_SECRET}`).toString('base64');

      const requestData = qs.stringify({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: process.env.QUICKBOOKS_REDIRECT_URI
      });

      console.log('📍 Token exchange request data:', {
        grant_type: 'authorization_code',
        code: code ? 'Present' : 'Missing',
        redirect_uri: process.env.QUICKBOOKS_REDIRECT_URI
      });

      const response = await axios.post(tokenEndpoint, requestData, {
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        }
      });

      console.log('✅ Manual token exchange successful');
      const tokenData = response.data;


      // Return in the same format as the library would
      return {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresIn: tokenData.expires_in || 3600,
        refreshTokenExpiresIn: tokenData.x_refresh_token_expires_in || 8726400,
        realmId: realmId, // We get this from the callback, not the token response
        tokenType: tokenData.token_type || 'Bearer'
      };

    } catch (error) {
      // If manual approach fails, try the library approach as fallback
      console.log('❌ Manual token exchange failed, trying library approach...');
      console.log('📍 Manual exchange error:', error.response?.data || error.message);

      try {
        console.log('📍 Fallback: Using intuit-oauth library');
        const authResponse = await this.oauthClient.createToken(code);

        console.log('✅ Token exchange successful via library fallback');
        console.log('📍 Token type:', authResponse.token_type);
        console.log('📍 Expires in:', authResponse.expires_in, 'seconds');

        return {
          accessToken: authResponse.access_token || authResponse.getToken().access_token,
          refreshToken: authResponse.refresh_token || authResponse.getToken().refresh_token,
          expiresIn: authResponse.expires_in || 3600,
          refreshTokenExpiresIn: authResponse.x_refresh_token_expires_in || 8726400,
          realmId: realmId || authResponse.realmId || authResponse.getToken().realmId,
          tokenType: authResponse.token_type || 'Bearer'
        };
      } catch (libraryError) {
        console.error('❌ Both manual and library token exchange failed');
        console.error('📍 Library error:', libraryError.message);

        // Log detailed error information
        if (error.response) {
          console.error('📍 HTTP Status:', error.response.status);
          console.error('📍 Response Data:', error.response.data);
          console.error('📍 Response Headers:', error.response.headers);
        } else if (error.authResponse) {
          console.error('📍 HTTP Status:', error.authResponse.status || 'Unknown');
          console.error('📍 HTTP Headers:', error.authResponse.headers || 'None');
          console.error('📍 Response Body:', error.authResponse.body || 'Empty');
          console.error('📍 Response JSON:', error.authResponse.json || 'None');

          // Try to parse and log specific QuickBooks error
          try {
            const responseData = error.authResponse.json || JSON.parse(error.authResponse.body || '{}');
            if (responseData.error_description) {
              console.error('📍 QuickBooks Error Description:', responseData.error_description);
            }
            if (responseData.error) {
              console.error('📍 QuickBooks Error Type:', responseData.error);
            }
          } catch (parseError) {
            console.error('📍 Could not parse error response:', parseError.message);
          }
        }

        // Log additional context
        console.error('📍 Original error message:', error.message);
        console.error('📍 Error stack:', error.stack);

        // Create more informative error message
        let errorMessage = 'QuickBooks token exchange failed';
        if (error.response?.data?.error_description) {
          errorMessage += `: ${error.response.data.error_description}`;
        } else if (error.response?.data?.error) {
          errorMessage += `: ${error.response.data.error}`;
        } else if (error.authResponse?.json?.error_description) {
          errorMessage += `: ${error.authResponse.json.error_description}`;
        } else if (error.authResponse?.json?.error) {
          errorMessage += `: ${error.authResponse.json.error}`;
        } else if (error.message) {
          errorMessage += `: ${error.message}`;
        }

        if (error.response?.status) {
          errorMessage += ` (HTTP ${error.response.status})`;
        } else if (error.authResponse?.status) {
          errorMessage += ` (HTTP ${error.authResponse.status})`;
        }

        throw new Error(errorMessage);
      }
    }
  }

  /**
   * Refresh access token
   * Based on: https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization/oauth-2.0#refresh-access-tokens
   */
  async refreshAccessToken(refreshToken) {
    try {
      console.log("🔁 Attempting to refresh token...");
      console.log("📍 Refresh token to use:", refreshToken ? `${refreshToken.substring(0, 10)}...${refreshToken.substring(refreshToken.length - 10)}` : 'MISSING');

      // Set the COMPLETE token object with all required fields
      this.oauthClient.token.setToken({
        token_type: 'bearer',
        refresh_token: refreshToken,
        access_token: '', // Can be empty, will be replaced
        expires_in: 3600,
        x_refresh_token_expires_in: 8726400,
        realmId: '' // Can be empty
      });

      // Log what's actually in the client before refresh
      console.log("📍 oauthClient token before refresh:", JSON.stringify(this.oauthClient.token.getToken()));

      const authResponse = await this.oauthClient.refresh();

      // Get the new token object
      const token = authResponse.getToken();

      console.log('✅ Token refresh successful');
      console.log('📍 New tokens:', JSON.stringify(token));
      console.log('📍 New expires in:', token.expires_in || 3600, 'seconds');

      return {
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        expiresIn: token.expires_in || 3600,
        tokenType: token.token_type || 'Bearer'
      };
    } catch (error) {
      console.error('❌ Token refresh failed');
      console.error('The error message is:', error.originalMessage || error.message);
      if (error.intuit_tid) {
        console.error('Intuit TID:', error.intuit_tid);
      }

      throw new Error(`QuickBooks token refresh failed: ${error.originalMessage || error.message || 'Unknown error'}`);
    }
  }

  /**
   * Make API request using manual HTTP calls (following official QB API documentation)
   * Reference: https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/companyinfo
   */
  async makeApiCall(options) {
    try {
      const axios = require('axios');

      console.log('🌐 Making QuickBooks API call:', {
        method: options.method || 'GET',
        url: options.url,
        hasAuth: !!options.headers?.Authorization
      });

      const response = await axios({
        method: options.method || 'GET',
        url: options.url,
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          ...options.headers
        },
        data: options.body ? JSON.parse(options.body) : undefined
      });

      console.log('✅ API call successful:', response.status);
      return response.data;

    } catch (error) {
      console.error('❌ API call failed:', error);

      // Handle QuickBooks API errors according to official documentation
      if (error.response?.data) {
        const errorData = error.response.data;

        // QuickBooks returns errors in Fault structure
        if (errorData.Fault) {
          const fault = errorData.Fault;
          const errorDetails = fault.Error?.[0] || {};
          const errorMessage = errorDetails.Detail || errorDetails.Message || fault.type || 'Unknown QuickBooks API error';
          throw new Error(`QuickBooks API Error: ${errorMessage} (Code: ${errorDetails.code || fault.code || 'N/A'})`);
        }
      }

      // Handle HTTP errors
      if (error.response) {
        throw new Error(`QuickBooks API HTTP Error: ${error.response.status} - ${error.response.statusText}`);
      }

      throw error;
    }
  }

  /**
   * Get company information
   * Based on: https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/companyinfo
   */
  async getCompanyInfo(accessToken, realmId) {
    try {
      console.log('🏢 Fetching company info for realmId:', realmId);

      // Make direct API call with proper authorization header
      const response = await this.makeApiCall({
        url: `${this.apiBaseUrl}/v3/company/${realmId}/companyinfo/${realmId}`,
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        }
      });

      console.log('✅ Company info fetched successfully');

      // QuickBooks returns company info in QueryResponse.CompanyInfo array
      if (response.QueryResponse?.CompanyInfo) {
        return response.QueryResponse.CompanyInfo[0];
      } else if (response.CompanyInfo) {
        return response.CompanyInfo;
      } else {
        console.error('❌ Unexpected response structure:', response);
        throw new Error('Company info not found in response');
      }

    } catch (error) {
      console.error('❌ Failed to fetch company info:', error);
      throw new Error(`Failed to fetch company info: ${error.message}`);
    }
  }

  /**
   * Get invoices
   * Based on: https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/invoice
   */
  async getInvoices(accessToken, realmId, params = {}) {
    try {
      const query = this.buildQuery('Invoice', params);
      const response = await this.makeApiCall({
        url: `${this.apiBaseUrl}/v3/company/${realmId}/query?query=${encodeURIComponent(query)}`,
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        }
      });

      return response.QueryResponse?.Invoice || [];
    } catch (error) {
      console.error('❌ Failed to fetch invoices:', error);
      throw new Error(`Failed to fetch invoices: ${error.message}`);
    }
  }

  /**
   * Create invoice
   * Based on: https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/invoice#create-an-invoice
   */
  async createInvoice(accessToken, realmId, invoiceData) {
    try {
      const response = await this.makeApiCall({
        url: `${this.apiBaseUrl}/v3/company/${realmId}/invoice`,
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify(invoiceData)
      });

      return response.Invoice;
    } catch (error) {
      console.error('❌ Failed to create invoice:', error);
      throw new Error(`Failed to create invoice: ${error.message}`);
    }
  }

  /**
   * Get customers
   * Based on: https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/customer
   */
  async getCustomers(accessToken, realmId, params = {}) {
    try {
      const query = this.buildQuery('Customer', params);
      const response = await this.makeApiCall({
        url: `${this.apiBaseUrl}/v3/company/${realmId}/query?query=${encodeURIComponent(query)}`,
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        }
      });

      return response.QueryResponse?.Customer || [];
    } catch (error) {
      console.error('❌ Failed to fetch customers:', error);
      throw new Error(`Failed to fetch customers: ${error.message}`);
    }
  }

  /**
   * Get expenses
   * Based on: https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/expense
   */
  async getExpenses(accessToken, realmId, params = {}) {
    try {
      // ✅ IMPORTANT: use Purchase, not Expense
      const query = this.buildQuery('Purchase', {
        ...params,
        paymentTypes: ['Cash', 'CreditCard']
      });

      const response = await this.makeApiCall({
        url: `${this.apiBaseUrl}/v3/company/${realmId}/query?query=${encodeURIComponent(query)}`,
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/text'
        }
      });

      // ✅ Purchase, not Expense
      return response.QueryResponse?.Purchase || [];
    } catch (error) {
      console.error(
        '❌ Failed to fetch expenses:',
        JSON.stringify(error.response?.data, null, 2)
      );

      const qbError = error.response?.data?.fault?.error?.[0];

      throw new Error(
        qbError?.message || 'Failed to fetch expenses from QuickBooks'
      );
    }
  }


  /**
   * Get vendors
   * Based on: https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/vendor
   */
  async getVendors(accessToken, realmId, params = {}) {
    try {
      const query = this.buildQuery('Vendor', params);
      const response = await this.makeApiCall({
        url: `${this.apiBaseUrl}/v3/company/${realmId}/query?query=${encodeURIComponent(query)}`,
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        }
      });

      return response.QueryResponse?.Vendor || [];
    } catch (error) {
      console.error('❌ Failed to fetch vendors:', error);
      throw new Error(`Failed to fetch vendors: ${error.message}`);
    }
  }

  /**
   * Get bills
   * Based on: https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/bill
   */
  async getBills(accessToken, realmId, params = {}) {
    try {
      const query = this.buildQuery('Bill', params);
      const response = await this.makeApiCall({
        url: `${this.apiBaseUrl}/v3/company/${realmId}/query?query=${encodeURIComponent(query)}`,
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        }
      });

      return response.QueryResponse?.Bill || [];
    } catch (error) {
      console.error('❌ Failed to fetch bills:', error);
      throw new Error(`Failed to fetch bills: ${error.message}`);
    }
  }

  /**
   * Get Profit & Loss Report
   * Based on: https://developer.intuit.com/app/developer/qbo/docs/api/accounting/report-entities/profitandloss
   */
  async getProfitLossReport(accessToken, realmId, params = {}) {
    return this.getReport(accessToken, realmId, 'ProfitAndLoss', {
      ...params,
      accountingMethod: params.accountingMethod || 'Accrual',
    });
  }


  /**
   * Get Balance Sheet Report
   * Based on: https://developer.intuit.com/app/developer/qbo/docs/api/accounting/report-entities/balancesheet
   */
  async getBalanceSheetReport(accessToken, realmId, params = {}) {
    return this.getReport(accessToken, realmId, 'BalanceSheet', {
      ...params,
      accountingMethod: params.accountingMethod || 'Accrual',
    });
  }

  async getGeneralLedgerReport(accessToken, realmId, params = {}) {
    return this.getReport(accessToken, realmId, 'GeneralLedger', {
      ...params,
      accountingMethod: params.accountingMethod || 'Accrual',
    });
  }

  async getCashFlowReport(accessToken, realmId, params = {}) {
    return this.getReport(accessToken, realmId, 'StatementOfCashFlows', {
      ...params,
      accountingMethod: params.accountingMethod || 'Accrual',
    });
  }


  async getTrialBalanceReport(accessToken, realmId, params = {}) {
    return this.getReport(accessToken, realmId, 'TrialBalance', {
      ...params,
      accountingMethod: params.accountingMethod || 'Accrual',
    });
  }


  /**
   * Format date for QuickBooks report params (YYYY-MM-DD)
   */
  formatReportDate(dateInput) {
    if (!dateInput) return undefined;

    let date = dateInput;
    if (typeof dateInput === 'string') {
      const parsed = new Date(dateInput);
      if (!isNaN(parsed)) {
        date = parsed;
      } else {
        return dateInput;
      }
    }

    if (date instanceof Date && !isNaN(date)) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }

    return dateInput;
  }

  /**
   * Revoke tokens (for disconnect)
   * Based on: https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization/oauth-2.0#revoke-access-tokens
   */
  async revokeTokens(refreshToken) {
    try {
      // Set the refresh token
      this.oauthClient.token.setToken({
        refresh_token: refreshToken,
        token_type: 'Bearer'
      });

      const response = await this.oauthClient.revoke({
        access_token: false,
        refresh_token: true
      });

      console.log('✅ Tokens revoked successfully');
      return true;
    } catch (error) {
      console.error('❌ Failed to revoke tokens:', error);
      // Don't throw error, as disconnect should succeed even if revoke fails
      return false;
    }
  }

  /**
   * Validate ID token for OpenID Connect
   * Based on: https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization/openid-connect
   */
  async validateIdToken(idToken) {
    try {
      const isValid = await this.oauthClient.validateIdToken(idToken);
      return isValid;
    } catch (error) {
      console.error('❌ ID token validation failed:', error);
      return false;
    }
  }

  /**
   * Get user info from OpenID Connect
   */
  async getUserInfo(accessToken) {
    try {
      // Set the access token
      this.oauthClient.token.setToken({
        access_token: accessToken,
        token_type: 'Bearer'
      });

      const response = await this.oauthClient.getUserInfo();
      return response.getJson();
    } catch (error) {
      console.error('❌ Failed to get user info:', error);
      throw new Error(`Failed to get user info: ${error.message}`);
    }
  }

  async getDashboardStats(accessToken, realmId) {
    try {
      // ---- 1️⃣ Cash Balance ----
      const accountQuery = "SELECT * FROM Account WHERE AccountType = 'Bank'";

      const accountsResponse = await this.makeApiCall({
        url: `${this.apiBaseUrl}/v3/company/${realmId}/query?query=${encodeURIComponent(accountQuery)}`,
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${accessToken}`
        }
      });

      const accounts = accountsResponse.QueryResponse?.Account || [];

      const cashBalance = accounts
        .filter(acc => acc.Active)
        .reduce((sum, acc) => sum + Number(acc.CurrentBalance || 0), 0);

      // ---- 2️⃣ Last Month Revenue ----
      const now = new Date();
      const firstDayLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastDayLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
      const startDate = firstDayLastMonth;
      const endDate = lastDayLastMonth;

      const params = {
        start_date: startDate,
        end_date: endDate,
        summarize_column_by: 'Total'
      };

      const revenueResponse = await this.getReport(accessToken, realmId, 'ProfitAndLoss', {
        ...params,
        accountingMethod: params.accountingMethod || 'Accrual',
      });


      const rows = revenueResponse.Rows?.Row || [];

      let lastMonthRevenue = 0;

      rows.forEach(section => {
        if (section?.group === "NetIncome" && section?.Summary?.ColData) {
          const value = section.Summary.ColData[1]?.value;
          if (!isNaN(value)) {
            lastMonthRevenue = Number(value);
          }
        }
      });

      // ---- 3️⃣ Return Both ----
      return {
        cashBalance,
        lastMonthRevenue,
      };

    } catch (error) {
      console.error('❌ Failed to fetch dashboard stats:', error);
      throw new Error(`Failed to fetch dashboard stats: ${error.message}`);
    }
  }


  async getEssentialPlanDashboardStats(accessToken, realmId) {
    try {
      // // ---- 1️⃣ Cash Balance ----
      // const accountQuery = "SELECT * FROM Account WHERE AccountType = 'Bank'";

      // const accountsResponse = await this.makeApiCall({
      //   url: `${this.apiBaseUrl}/v3/company/${realmId}/query?query=${encodeURIComponent(accountQuery)}`,
      //   method: 'GET',
      //   headers: {
      //     Accept: 'application/json',
      //     Authorization: `Bearer ${accessToken}`
      //   }
      // });

      // const accounts = accountsResponse.QueryResponse?.Account || [];

      // const cashBalance = accounts
      //   .filter(acc => acc.Active)
      //   .reduce((sum, acc) => sum + Number(acc.CurrentBalance || 0), 0);

      // ---- 2️⃣ Current Month Revenue ----
      const now = new Date();

      // First day of current month
      const firstDayCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      // Today (or last day of month if you prefer full month projection)
      const today = new Date();

      const startDate = firstDayCurrentMonth;
      const endDate = today;

      console.log('📅 Fetching P&L report for current month:', { startDate, endDate });


      const params = {
        start_date: startDate,
        end_date: endDate,
        summarize_column_by: 'Total'
      };

      const revenueResponse = await this.getReport(accessToken, realmId, 'ProfitAndLoss', {
        ...params,
        accountingMethod: params.accountingMethod || 'Accrual',
      });

      console.log(revenueResponse)


      const rows = revenueResponse.Rows?.Row || [];

      // let lastMonthRevenue = 0;

      // rows.forEach(section => {
      //   if (section?.group === "NetIncome" && section?.Summary?.ColData) {
      //     const value = section.Summary.ColData[1]?.value;
      //     if (!isNaN(value)) {
      //       lastMonthRevenue = Number(value);
      //     }
      //   }
      // });

      const revenue = this.extractValueByGroup(rows, "Income");
      const expenses = this.extractValueByGroup(rows, "Expenses");
      const netIncome = this.extractValueByGroup(rows, "NetIncome");
      const cogs = this.extractValueByGroup(rows, "COGS");

      // Gross Margin %
      const grossMargin =
        revenue > 0
          ? (((revenue - cogs) / revenue) * 100).toFixed(2)
          : 0;



      // ---- 3️⃣ Return Both ----
      return {
        // cashBalance,
        // lastMonthRevenue,
        revenue,
        expenses,
        netIncome,
        grossMargin
      };

    } catch (error) {
      console.error('❌ Failed to fetch dashboard stats:', error);
      throw new Error(`Failed to fetch dashboard stats: ${error.message}`);
    }
  }


  extractValueByGroup(rows, groupName) {
    for (const row of rows) {
      if (row?.group === groupName && row?.Summary?.ColData) {
        return Number(row.Summary.ColData[1]?.value || 0);
      }
      if (row?.Rows?.Row) {
        const result = this.extractValueByGroup(row.Rows.Row, groupName);
        if (result !== 0) return result;
      }
    }
    return 0;
  };

  async getReport(accessToken, realmId, reportName, params = {}) {
    try {
      console.log(`📊 Fetching ${reportName} report with raw params:`, params);
      const startDateRaw = params.startDate ?? params.start_date;
      const endDateRaw = params.endDate ?? params.end_date;

      const startDate = this.formatReportDate(startDateRaw);
      const endDate = this.formatReportDate(endDateRaw);

      console.log(`📅 Fetching ${reportName} report with params:`, {
        startDate: startDate || 'Not provided',
        endDate: endDate || 'Not provided',
        summarizeBy: params.summarizeBy || 'Not provided',
        accountingMethod: params.accountingMethod || 'Not provided'
      });

      const queryParams = new URLSearchParams();

      if (startDate) queryParams.set('start_date', startDate);
      if (endDate) queryParams.set('end_date', endDate);

      if (params.summarizeBy) {
        queryParams.set('summarize_column_by', params.summarizeBy);
      }

      // if (params.accountingMethod) {
      //   queryParams.set('accounting_method', params.accountingMethod);
      // }

      const response = await this.makeApiCall({
        url: `${this.apiBaseUrl}/v3/company/${realmId}/reports/${reportName}?${queryParams.toString()}`,
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
      });

      return response;
    } catch (error) {
      console.error(`❌ Failed to fetch ${reportName}:`, error);
      throw new Error(`Failed to fetch ${reportName}: ${error.message}`);
    }
  }





  /**
   * Build query string for QuickBooks API
   * Based on: https://developer.intuit.com/app/developer/qbo/docs/develop/explore-the-quickbooks-online-api/data-queries
   */
  buildQuery(entity, params = {}) {
    let query = `SELECT * FROM ${entity}`;
    const conditions = [];

    // Helper function to format dates for QuickBooks API
    const formatDateForQuickBooks = (dateInput) => {
      let date;
      if (typeof dateInput === 'string') {
        date = new Date(dateInput);
      } else if (dateInput instanceof Date) {
        date = dateInput;
      } else {
        return dateInput; // Return as-is if not a recognizable date
      }

      // QuickBooks expects YYYY-MM-DD format
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');

      return `${year}-${month}-${day}`;
    };

    if (params.startDate) {
      const formattedStartDate = formatDateForQuickBooks(params.startDate);
      conditions.push(`MetaData.CreateTime >= '${formattedStartDate}'`);
      console.log('📅 Formatted start date:', `${params.startDate} -> ${formattedStartDate}`);
    }
    if (params.endDate) {
      const formattedEndDate = formatDateForQuickBooks(params.endDate);
      conditions.push(`MetaData.CreateTime <= '${formattedEndDate}'`);
      console.log('📅 Formatted end date:', `${params.endDate} -> ${formattedEndDate}`);
    }
    if (params.customerRef) {
      conditions.push(`CustomerRef = '${params.customerRef}'`);
    }
    if (params.active !== undefined) {
      conditions.push(`Active = ${params.active}`);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    if (params.orderBy) {
      query += ` ORDERBY ${params.orderBy}`;
    }

    if (params.limit) {
      query += ` MAXRESULTS ${params.limit}`;
    }

    console.log('🔍 Generated QuickBooks query:', query);
    return query;
  }

  /**
   * Check if access token is valid
   */
  isAccessTokenValid(tokenExpiresAt) {
    const now = new Date();
    const expiresAt = new Date(tokenExpiresAt);
    return expiresAt > now;
  }

  /**
   * Verify webhook signature
   * Based on: https://developer.intuit.com/app/developer/qbo/docs/develop/webhooks/configure-webhooks#validate-the-notification
   */
  verifyWebhookSignature(signature, payload, webhookToken) {
    const crypto = require('crypto');

    if (!webhookToken) {
      webhookToken = process.env.QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN;
    }

    const hash = crypto
      .createHmac('sha256', webhookToken)
      .update(payload)
      .digest('base64');

    return hash === signature;
  }



}

// Export as singleton
module.exports = new QuickBooksService();


