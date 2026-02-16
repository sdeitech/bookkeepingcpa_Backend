const QuickBooksCompany = require('../models/quickbooksCompanyModel');
const quickbooksService = require('../services/quickbooks.service');
const encryptionService = require('../services/encryption.services');
const resModel = require('../lib/resModel');
const { getUserId } = require('../utils/getUserContext');

// Helper function to convert month names to numbers
const convertMonthToNumber = (monthString) => {
  if (!monthString || typeof monthString === 'number') return monthString;

  const months = {
    'January': 1, 'February': 2, 'March': 3, 'April': 4,
    'May': 5, 'June': 6, 'July': 7, 'August': 8,
    'September': 9, 'October': 10, 'November': 11, 'December': 12
  };

  return months[monthString] || null;
};

const quickbooksController = {
  /**
   * Generate OAuth authorization URL
   * GET /api/quickbooks/auth/authorize
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

      // Check if already connected
      const existingCompany = await QuickBooksCompany.findOne({
        userId,
        isActive: true
      });

      // if (existingCompany) {
      //   resModel.success = false;
      //   resModel.message = 'QuickBooks account already connected. Please disconnect first to reconnect.';
      //   resModel.data = {
      //     connected: true,
      //     companyName: existingCompany.companyName
      //   };
      //   return res.status(400).json(resModel);
      // }

      // Generate authorization URL with state
      const { url, state } = quickbooksService.generateAuthUrl(userId);

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
   * Handle OAuth callback from QuickBooks
   * GET /api/quickbooks/auth/callback
   */
  handleCallback: async (req, res) => {
    try {
      const { code, state, realmId, error } = req.query;

      console.log('🔍 QuickBooks OAuth Callback received:');
      console.log('  - Full URL:', req.originalUrl);
      console.log('  - Code:', code ? `Present (length: ${code.length})` : 'Missing');
      console.log('  - State:', state || 'Missing');
      console.log('  - RealmId:', realmId || 'Missing');
      console.log('  - Error:', error || 'None');
      console.log('  - All query params:', req.query);

      // Check for authorization errors first
      if (error) {
        console.error('❌ QuickBooks authorization error:', error);
        const frontendUrl = `${process.env.FRONTEND_URL}/dashboard?qb_error=${encodeURIComponent(error)}`;
        return res.redirect(frontendUrl);
      }

      // Validate required parameters
      const missingParams = [];
      if (!code) missingParams.push('code');
      if (!state) missingParams.push('state');
      if (!realmId) missingParams.push('realmId');

      if (missingParams.length > 0) {
        const errorMessage = `Missing required parameters: ${missingParams.join(', ')}`;
        console.error('❌', errorMessage);
        console.error('📍 This usually indicates an issue with the OAuth flow or redirect URI configuration');
        const frontendUrl = `${process.env.FRONTEND_URL}/dashboard?qb_error=${encodeURIComponent(errorMessage)}`;
        return res.redirect(frontendUrl);
      }

      // Validate and extract userId from state
      if (!state.includes(':')) {
        console.error('❌ Invalid state format. Expected "userId:randomString"');
        const frontendUrl = `${process.env.FRONTEND_URL}/dashboard?qb_error=${encodeURIComponent('Invalid state parameter')}`;
        return res.redirect(frontendUrl);
      }

      const [userId, stateToken] = state.split(':');
      console.log('📍 Extracted userId:', userId);
      console.log('📍 State token:', stateToken ? 'Present' : 'Missing');

      if (!userId || !stateToken) {
        console.error('❌ Invalid state components');
        const frontendUrl = `${process.env.FRONTEND_URL}/dashboard?qb_error=${encodeURIComponent('Invalid state parameter format')}`;
        return res.redirect(frontendUrl);
      }

      // Log token exchange attempt
      console.log('🔄 Starting token exchange process...');

      // Exchange code for tokens - pass all the parameters we received
      const tokenData = await quickbooksService.exchangeCodeForTokens(code, realmId, state);
      console.log('✅ Tokens exchanged successfully');
      console.log(tokenData.accessToken);

      // Get company information
      const companyInfo = await quickbooksService.getCompanyInfo(tokenData.accessToken, realmId);
      console.log('✅ Company info fetched:', companyInfo.CompanyName);


      // Encrypt tokens before storing
      const encryptedAccessToken = encryptionService.encrypt(tokenData.accessToken);
      const encryptedRefreshToken = encryptionService.encrypt(tokenData.refreshToken);

      // Calculate token expiry
      const tokenExpiresAt = new Date(Date.now() + (tokenData.expiresIn * 1000));
      const refreshTokenExpiresAt = new Date(Date.now() + (tokenData.refreshTokenExpiresIn * 1000));

      // Save or update company data with proper data type conversion
      console.log('💾 Saving company data to database...');
      console.log('📍 Raw fiscal year start month:', companyInfo.FiscalYearStartMonth);
      console.log('📍 Raw tax year start month:', companyInfo.TaxYearStartMonth);

      const companyData = await QuickBooksCompany.findOneAndUpdate(
        { userId },
        {
          companyId: realmId,
          companyName: companyInfo.CompanyName,
          companyType: companyInfo.CompanyType,
          legalName: companyInfo.LegalName,
          companyEmail: companyInfo.Email?.Address,
          companyPhone: companyInfo.PrimaryPhone?.FreeFormNumber,
          companyAddress: {
            line1: companyInfo.CompanyAddr?.Line1,
            city: companyInfo.CompanyAddr?.City,
            state: companyInfo.CompanyAddr?.CountrySubDivisionCode,
            postalCode: companyInfo.CompanyAddr?.PostalCode,
            country: companyInfo.CompanyAddr?.Country || 'USA'
          },
          // Convert month names to numbers for database storage
          fiscalYearStartMonth: convertMonthToNumber(companyInfo.FiscalYearStartMonth),
          taxYearStartMonth: convertMonthToNumber(companyInfo.TaxYearStartMonth),
          baseCurrency: companyInfo.BaseCurrencyRef?.value || 'USD',
          multiCurrencyEnabled: companyInfo.MultiCurrencyEnabled || false,
          accessToken: encryptedAccessToken,
          refreshToken: encryptedRefreshToken,
          tokenExpiresAt,
          refreshTokenExpiresAt,
          isActive: true,
          isPaused: false,
          lastSyncedAt: new Date()
        },
        {
          upsert: true,
          new: true,
          runValidators: true
        }
      );

      console.log('✅ Company data saved successfully');

      console.log(`✅ QuickBooks connected: ${companyData.companyName} (${companyData.companyId})`);

      // Redirect to frontend with success
      const frontendUrl = `${process.env.FRONTEND_URL}/dashboard?qb_connected=true&company=${encodeURIComponent(companyData.companyName)}`;
      return res.redirect(frontendUrl);

    } catch (error) {
      console.error('❌ Handle callback error:', error);
      const frontendUrl = `${process.env.FRONTEND_URL}/dashboard?qb_error=${encodeURIComponent(error.message)}`;
      return res.redirect(frontendUrl);
    }
  },

  /**
   * Get connection status
   * GET /api/quickbooks/auth/status
   */
  getConnectionStatus: async (req, res) => {
    try {
      const userId = getUserId(req);
      const company = await QuickBooksCompany.findOne({ userId })
        .select('isActive companyId companyName companyEmail companyAddress baseCurrency lastSyncedAt tokenExpiresAt createdAt stats isPaused');

      if (!company) {
        resModel.success = true;
        resModel.message = 'QuickBooks account not connected';
        resModel.data = {
          connected: false
        };
        return res.status(200).json(resModel);
      }

      const now = new Date();
      const tokenExpired = company.tokenExpiresAt < now;
      const needsRefresh = company.needsTokenRefresh;

      resModel.success = true;
      resModel.message = 'Connection status retrieved';
      resModel.data = {
        connected: company.isActive && !tokenExpired,
        companyId: company.companyId,
        companyName: company.companyName,
        companyEmail: company.companyEmail,
        companyAddress: company.companyAddress,
        baseCurrency: company.baseCurrency,
        lastSyncedAt: company.lastSyncedAt,
        tokenExpired,
        needsRefresh,
        isPaused: company.isPaused,
        connectedSince: company.createdAt,
        stats: company.stats
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
   * Refresh access token
   * POST /api/quickbooks/auth/refresh
   */
  refreshToken: async (req, res) => {
    try {
      const userId = getUserId(req);
      const company = await QuickBooksCompany.findOne({ userId });

      if (!company) {
        resModel.success = false;
        resModel.message = 'QuickBooks account not connected';
        resModel.data = null;
        return res.status(404).json(resModel);
      }

      // Decrypt refresh token
      const decryptedRefreshToken = encryptionService.decrypt(company.refreshToken);

      // Get new access token
      const newTokenData = await quickbooksService.refreshAccessToken(decryptedRefreshToken);

      // Update tokens in database
      company.accessToken = encryptionService.encrypt(newTokenData.accessToken);
      company.refreshToken = encryptionService.encrypt(newTokenData.refreshToken);
      company.tokenExpiresAt = new Date(Date.now() + (newTokenData.expiresIn * 1000));
      company.lastSyncedAt = new Date();
      await company.save();

      resModel.success = true;
      resModel.message = 'Token refreshed successfully';
      resModel.data = {
        expiresAt: company.tokenExpiresAt
      };
      return res.status(200).json(resModel);
    } catch (error) {
      console.error('Refresh token error:', error);

      // If refresh fails, mark account as inactive
      await QuickBooksCompany.findOneAndUpdate(
        { userId: req.userInfo?.id },
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
      resModel.message = 'Token refresh failed. Please reconnect your QuickBooks account.';
      resModel.data = null;
      return res.status(401).json(resModel);
    }
  },

  /**
   * Disconnect QuickBooks account
   * DELETE /api/quickbooks/auth/disconnect
   */
  disconnect: async (req, res) => {
    try {
      const userId = getUserId(req);
      const company = await QuickBooksCompany.findOne({ userId });

      if (!company) {
        resModel.success = false;
        resModel.message = 'QuickBooks account not connected';
        resModel.data = null;
        return res.status(404).json(resModel);
      }

      // Try to revoke tokens
      try {
        const decryptedRefreshToken = encryptionService.decrypt(company.refreshToken);
        await quickbooksService.revokeTokens(decryptedRefreshToken);
        console.log('✅ Tokens revoked successfully');
      } catch (revokeError) {
        console.error('Failed to revoke tokens:', revokeError);
        // Continue with disconnect even if revoke fails
      }

      // Delete company record
      await QuickBooksCompany.findOneAndDelete({ userId });

      resModel.success = true;
      resModel.message = 'QuickBooks account disconnected successfully';
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
   * Get invoices from QuickBooks
   * GET /api/quickbooks/invoices
   */
  getInvoices: async (req, res) => {
    console.log('📍 Get invoices request received with query:', req.query);
    try {
      const userId = getUserId(req);
      console.log('📍 Fetching invoices for user:', userId);
      const company = await QuickBooksCompany.findOne({ userId });

      if (!company || !company.isActive) {
        resModel.success = false;
        resModel.message = 'QuickBooks account not connected or inactive';
        resModel.data = null;
        return res.status(404).json(resModel);
      }

      // Refresh token if needed
      let accessToken = encryptionService.decrypt(company.accessToken);
      

      // if (company.needsTokenRefresh) {
      //   const decryptedRefreshToken = encryptionService.decrypt(company.refreshToken);
      //   const newTokenData = await quickbooksService.refreshAccessToken(decryptedRefreshToken);
      //   accessToken = newTokenData.accessToken;

      //   company.accessToken = encryptionService.encrypt(newTokenData.accessToken);
      //   company.refreshToken = encryptionService.encrypt(newTokenData.refreshToken);
      //   company.tokenExpiresAt = new Date(Date.now() + (newTokenData.expiresIn * 1000));
      //   await company.save();
      // }

      // Fetch invoices
      const invoices = await quickbooksService.getInvoices(accessToken, company.companyId, req.query);

      // Update sync timestamp and stats
      company.lastInvoiceSync = new Date();
      company.lastSyncedAt = new Date();
      company.stats.totalInvoices = invoices.length;
      if (invoices.length > 0) {
        company.stats.lastInvoiceDate = new Date(invoices[0].MetaData?.CreateTime);
      }
      await company.save();

      resModel.success = true;
      resModel.message = `Successfully fetched ${invoices.length} invoices`;
      resModel.data = {
        invoices,
        count: invoices.length,
        company: {
          companyName: company.companyName,
          baseCurrency: company.baseCurrency
        }
      };
      return res.status(200).json(resModel);
    } catch (error) {
      console.error('Get invoices error:', error);

      // Record error
      if (req.userInfo?.id) {
        const company = await QuickBooksCompany.findOne({ userId: req.userInfo.id });
        if (company) {
          await company.recordError(error);
        }
      }

      resModel.success = false;
      resModel.message = `Failed to fetch invoices: ${error.message}`;
      resModel.data = null;
      return res.status(500).json(resModel);
    }
  },

  getCashBalance: async (req, res) => {
    try {
      const userId = getUserId(req);
      const company = await QuickBooksCompany.findOne({ userId });
  
      if (!company || !company.isActive) {
        resModel.success = false;
        resModel.message = 'QuickBooks account not connected or inactive';
        resModel.data = null;
        return res.status(404).json(resModel);
      }
  
      // Decrypt access token
      let accessToken = encryptionService.decrypt(company.accessToken);
  
      // Fetch bank accounts from QuickBooks
      const accounts = await quickbooksService.getDashboardStats(
        accessToken,
        company.companyId
      );
      
      const totalCashBalance = accounts.cashBalance
      const lastMonthRevenue = accounts.lastMonthRevenue;
      const revenue = accounts.revenue;
      const expenses = accounts.expenses;
      const netIncome = accounts.netIncome;
      const grossMargin = accounts.grossMargin;

     
      
  
      // Update stats
      company.stats.cashBalance = totalCashBalance;
      company.stats.lastMonthRevenue = lastMonthRevenue;
      company.lastSyncedAt = new Date();
      await company.save();
  
      resModel.success = true;
      resModel.message = 'Cash balance fetched successfully';
      resModel.data = {
        stats:company.stats,
        revenue,
        expenses,
        netIncome,
        grossMargin
      };
  
      return res.status(200).json(resModel);
    } catch (error) {
      console.error('Get cash balance error:', error);
  
      if (req.userInfo?.id) {
        const company = await QuickBooksCompany.findOne({ userId: req.userInfo.id });
        if (company) {
          await company.recordError(error);
        }
      }
  
      resModel.success = false;
      resModel.message = `Failed to fetch cash balance: ${error.message}`;
      resModel.data = null;
      return res.status(500).json(resModel);
    }
  },


  getEssentailDashboardstats: async (req, res) => {
    try {
      const userId = getUserId(req);
      const company = await QuickBooksCompany.findOne({ userId });
  
      if (!company || !company.isActive) {
        resModel.success = false;
        resModel.message = 'QuickBooks account not connected or inactive';
        resModel.data = null;
        return res.status(404).json(resModel);
      }
  
      // Decrypt access token
      let accessToken = encryptionService.decrypt(company.accessToken);
  
      // Fetch bank accounts from QuickBooks
      const accounts = await quickbooksService.getEssentialPlanDashboardStats(
        accessToken,
        company.companyId
      );
      
      // const totalCashBalance = accounts.cashBalance
      // const lastMonthRevenue = accounts.lastMonthRevenue;
      const revenue = accounts.revenue;
      const expenses = accounts.expenses;
      const netIncome = accounts.netIncome;
      const grossMargin = accounts.grossMargin;

     
      
  
      // Update stats
      // company.stats.cashBalance = totalCashBalance;
      // company.stats.lastMonthRevenue = lastMonthRevenue;
      company.stats.revenue = revenue;
      company.stats.expenses = expenses;
      company.stats.netIncome = netIncome;
      company.stats.grossMargin = grossMargin;
      company.lastSyncedAt = new Date();
      await company.save();
  
      resModel.success = true;
      resModel.message = 'Essential Plan data fetched successfully';
      resModel.data = {
        stats:company.stats,
        revenue,
        expenses,
        netIncome,
        grossMargin
      };
  
      return res.status(200).json(resModel);
    } catch (error) {
      console.error('Get cash balance error:', error);
  
      if (req.userInfo?.id) {
        const company = await QuickBooksCompany.findOne({ userId: req.userInfo.id });
        if (company) {
          await company.recordError(error);
        }
      }
  
      resModel.success = false;
      resModel.message = `Failed to fetch cash balance: ${error.message}`;
      resModel.data = null;
      return res.status(500).json(resModel);
    }
  },
  

  /**
   * Get customers from QuickBooks
   * GET /api/quickbooks/customers
   */
  getCustomers: async (req, res) => {
    try {
      const userId = getUserId(req);
      const company = await QuickBooksCompany.findOne({ userId });

      if (!company || !company.isActive) {
        resModel.success = false;
        resModel.message = 'QuickBooks account not connected or inactive';
        resModel.data = null;
        return res.status(404).json(resModel);
      }

      let accessToken = encryptionService.decrypt(company.accessToken);

      // Refresh token if needed
      // if (company.needsTokenRefresh) {
      //   const decryptedRefreshToken = encryptionService.decrypt(company.refreshToken);
      //   const newTokenData = await quickbooksService.refreshAccessToken(decryptedRefreshToken);
      //   accessToken = newTokenData.accessToken;

      //   company.accessToken = encryptionService.encrypt(newTokenData.accessToken);
      //   company.refreshToken = encryptionService.encrypt(newTokenData.refreshToken);
      //   company.tokenExpiresAt = new Date(Date.now() + (newTokenData.expiresIn * 1000));
      //   await company.save();
      // }

      // Fetch customers
      const customers = await quickbooksService.getCustomers(accessToken, company.companyId, req.query);

      // Update stats
      company.stats.totalCustomers = customers.length;
      company.lastSyncedAt = new Date();
      await company.save();

      resModel.success = true;
      resModel.message = `Successfully fetched ${customers.length} customers`;
      resModel.data = {
        customers,
        count: customers.length
      };
      return res.status(200).json(resModel);
    } catch (error) {
      console.error('Get customers error:', error);
      resModel.success = false;
      resModel.message = `Failed to fetch customers: ${error.message}`;
      resModel.data = null;
      return res.status(500).json(resModel);
    }
  },

  /**
   * Get expenses from QuickBooks
   * GET /api/quickbooks/expenses
   */
  getExpenses: async (req, res) => {
    try {
      const userId = req.userInfo?.id;
      const company = await QuickBooksCompany.findOne({ userId });

      if (!company || !company.isActive) {
        resModel.success = false;
        resModel.message = 'QuickBooks account not connected or inactive';
        resModel.data = null;
        return res.status(404).json(resModel);
      }

      let accessToken = encryptionService.decrypt(company.accessToken);

      // Refresh token if needed
      // if (company.needsTokenRefresh) {
      //   const decryptedRefreshToken = encryptionService.decrypt(company.refreshToken);
      //   const newTokenData = await quickbooksService.refreshAccessToken(decryptedRefreshToken);
      //   accessToken = newTokenData.accessToken;

      //   company.accessToken = encryptionService.encrypt(newTokenData.accessToken);
      //   company.refreshToken = encryptionService.encrypt(newTokenData.refreshToken);
      //   company.tokenExpiresAt = new Date(Date.now() + (newTokenData.expiresIn * 1000));
      //   await company.save();
      // }

      // Fetch expenses
      const expenses = await quickbooksService.getExpenses(accessToken, company.companyId, req.query);

      // Update stats
      company.lastExpenseSync = new Date();
      company.lastSyncedAt = new Date();
      company.stats.totalExpenses = expenses.length;
      if (expenses.length > 0) {
        company.stats.lastExpenseDate = new Date(expenses[0].MetaData?.CreateTime);
      }
      await company.save();

      resModel.success = true;
      resModel.message = `Successfully fetched ${expenses.length} expenses`;
      resModel.data = {
        expenses,
        count: expenses.length
      };
      return res.status(200).json(resModel);
    } catch (error) {
      console.error('Get expenses error:', error);
      resModel.success = false;
      resModel.message = `Failed to fetch expenses: ${error.message}`;
      resModel.data = null;
      return res.status(500).json(resModel);
    }
  },

  /**
   * Get vendors from QuickBooks
   * GET /api/quickbooks/vendors
   */
  getVendors: async (req, res) => {
    try {
      const company = req.quickbooksCompany; // From middleware
      let accessToken = encryptionService.decrypt(company.accessToken);

      // Fetch vendors
      const vendors = await quickbooksService.getVendors(accessToken, company.companyId, req.query);

      // Update stats
      company.stats.totalVendors = vendors.length;
      company.lastSyncedAt = new Date();
      await company.save();

      resModel.success = true;
      resModel.message = `Successfully fetched ${vendors.length} vendors`;
      resModel.data = {
        vendors,
        count: vendors.length
      };
      return res.status(200).json(resModel);
    } catch (error) {
      console.error('Get vendors error:', error);
      resModel.success = false;
      resModel.message = `Failed to fetch vendors: ${error.message}`;
      resModel.data = null;
      return res.status(500).json(resModel);
    }
  },

  /**
   * Get bills from QuickBooks
   * GET /api/quickbooks/bills
   */
  getBills: async (req, res) => {
    try {
      const company = req.quickbooksCompany; // From middleware
      let accessToken = encryptionService.decrypt(company.accessToken);

      // Fetch bills
      const bills = await quickbooksService.getBills(accessToken, company.companyId, req.query);

      // Update stats
      company.stats.totalBills = bills.length;
      if (bills.length > 0) {
        company.stats.lastBillDate = new Date(bills[0].MetaData?.CreateTime);
      }
      company.lastSyncedAt = new Date();
      await company.save();

      resModel.success = true;
      resModel.message = `Successfully fetched ${bills.length} bills`;
      resModel.data = {
        bills,
        count: bills.length
      };
      return res.status(200).json(resModel);
    } catch (error) {
      console.error('Get bills error:', error);
      resModel.success = false;
      resModel.message = `Failed to fetch bills: ${error.message}`;
      resModel.data = null;
      return res.status(500).json(resModel);
    }
  },

  /**
   * Get Profit & Loss report
   * GET /api/quickbooks/reports/profit-loss
   */
  getProfitLossReport: async (req, res) => {
    try {
      const company = req.quickbooksCompany; // From middleware
      let accessToken = encryptionService.decrypt(company.accessToken);
      
      // Validate date parameters
      const { startDate, endDate } = req.query;
      if (!startDate || !endDate) {
        resModel.success = false;
        resModel.message = 'Start date and end date are required';
        resModel.data = null;
        return res.status(400).json(resModel);
      }
      
      // Fetch report
      const report = await quickbooksService.getProfitLossReport(accessToken, company.companyId, req.query);
      
      // Update stats
      company.lastReportSync = new Date();
      company.stats.lastReportGenerated = new Date();
      await company.save();

      resModel.success = true;
      resModel.message = 'Profit & Loss report generated successfully';
      resModel.data = report;
      return res.status(200).json(resModel);
    } catch (error) {
      console.error('Get P&L report error:', error);
      resModel.success = false;
      resModel.message = `Failed to generate report: ${error.message}`;
      resModel.data = null;
      return res.status(500).json(resModel);
    }
  },


  /**
   * Get Balance Sheet report
   * GET /api/quickbooks/reports/balance-sheet
   */
  getBalanceSheetReport: async (req, res) => {
    try {
      const company = req.quickbooksCompany; // From middleware
      let accessToken = encryptionService.decrypt(company.accessToken);
      
      // Validate date parameters
      const { startDate, endDate } = req.query;
      if (!startDate || !endDate) {
        resModel.success = false;
        resModel.message = 'Start date and end date are required';
        resModel.data = null;
        return res.status(400).json(resModel);
      }
      
      // Fetch report
      const report = await quickbooksService.getBalanceSheetReport(accessToken, company.companyId, req.query);
      
      // Update stats
      company.lastReportSync = new Date();
      company.stats.lastReportGenerated = new Date();
      await company.save();

      resModel.success = true;
      resModel.message = 'Balance Sheet report generated successfully';
      resModel.data = report;
      return res.status(200).json(resModel);
    } catch (error) {
      console.error('Get Balance Sheet report error:', error);
      resModel.success = false;
      resModel.message = `Failed to generate report: ${error.message}`;
      resModel.data = null;
      return res.status(500).json(resModel);
    }
  },

  getGeneralLedgerReport: async (req, res) => {
    try {
      const company = req.quickbooksCompany; // From middleware
      let accessToken = encryptionService.decrypt(company.accessToken);
      
      // Validate date parameters
      const { startDate, endDate } = req.query;
      if (!startDate || !endDate) {
        resModel.success = false;
        resModel.message = 'Start date and end date are required';
        resModel.data = null;
        return res.status(400).json(resModel);
      }
      
      // Fetch report
      const report = await quickbooksService.getGeneralLedgerReport(accessToken, company.companyId, req.query);
      
      // Update stats
      company.lastReportSync = new Date();
      company.stats.lastReportGenerated = new Date();
      await company.save();

      resModel.success = true;
      resModel.message = 'General Ledger report generated successfully';
      resModel.data = report;
      return res.status(200).json(resModel);
    } catch (error) {
      console.error('Get General Ledger report error:', error);
      resModel.success = false;
      resModel.message = `Failed to generate report: ${error.message}`;
      resModel.data = null;
      return res.status(500).json(resModel);
    }
  },

  /**
   * Get dashboard data
   * GET /api/quickbooks/dashboard
   */
  getDashboardData: async (req, res) => {
    try {
      const userId = req.userInfo?.id;
      const company = await QuickBooksCompany.findOne({ userId });

      if (!company || !company.isActive) {
        resModel.success = false;
        resModel.message = 'QuickBooks account not connected or inactive';
        resModel.data = null;
        return res.status(404).json(resModel);
      }

      let accessToken = encryptionService.decrypt(company.accessToken);

      // Refresh token if needed
      if (company.needsTokenRefresh) {
        const decryptedRefreshToken = encryptionService.decrypt(company.refreshToken);
        const newTokenData = await quickbooksService.refreshAccessToken(decryptedRefreshToken);
        accessToken = newTokenData.accessToken;

        company.accessToken = encryptionService.encrypt(newTokenData.accessToken);
        company.refreshToken = encryptionService.encrypt(newTokenData.refreshToken);
        company.tokenExpiresAt = new Date(Date.now() + (newTokenData.expiresIn * 1000));
        await company.save();
      }

      // Prepare dashboard data
      const dashboardData = {
        company: {
          companyId: company.companyId,
          companyName: company.companyName,
          companyEmail: company.companyEmail,
          baseCurrency: company.baseCurrency,
          lastSyncedAt: company.lastSyncedAt
        },
        metrics: {},
        stats: company.stats
      };

      // Fetch recent invoices (last 30 days)
      try {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const invoices = await quickbooksService.getInvoices(accessToken, company.companyId, {
          startDate: thirtyDaysAgo,
          limit: 10
        });
        dashboardData.metrics.recentInvoices = invoices;
      } catch (error) {
        console.error('Failed to fetch invoices for dashboard:', error);
        dashboardData.metrics.recentInvoices = { error: error.message };
      }

      // Fetch recent expenses (last 30 days)
      try {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const expenses = await quickbooksService.getExpenses(accessToken, company.companyId, {
          startDate: thirtyDaysAgo,
          limit: 10
        });
        dashboardData.metrics.recentExpenses = expenses;
      } catch (error) {
        console.error('Failed to fetch expenses for dashboard:', error);
        dashboardData.metrics.recentExpenses = { error: error.message };
      }

      // Update last synced time
      company.lastSyncedAt = new Date();
      await company.save();

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
  },

  /**
   * Health check endpoint
   * GET /api/quickbooks/health
   */
  health: async (req, res) => {
    const isConfigured = !!(
      process.env.QUICKBOOKS_CLIENT_ID &&
      process.env.QUICKBOOKS_CLIENT_SECRET &&
      process.env.QUICKBOOKS_REDIRECT_URI
    );

    resModel.success = true;
    resModel.message = 'QuickBooks integration health check';
    resModel.data = {
      configured: isConfigured,
      environment: process.env.QUICKBOOKS_ENVIRONMENT || 'sandbox',
      scopes: process.env.QUICKBOOKS_SCOPES?.split(' ') || [],
      timestamp: new Date().toISOString()
    };
    return res.status(200).json(resModel);
  },

  syncQuickBooksData: async (req, res) => {
    try {
      const userId = req.userInfo?.id;
      console.log('🔄 Starting QuickBooks sync for user:', userId);
  
      const company = await QuickBooksCompany.findOne({ userId });
      if (!company || !company.isActive) {
        return res.status(404).json({
          success: false,
          message: "QuickBooks account not connected or inactive",
          data: null,
        });
      }
  
      let accessToken = encryptionService.decrypt(company.accessToken);
  
      // 🔁 Refresh token if expired (SAME as dashboard)
      if (company.needsTokenRefresh) {
        const decryptedRefreshToken = encryptionService.decrypt(company.refreshToken);
  
        const newTokenData =
          await quickbooksService.refreshAccessToken(decryptedRefreshToken);
  
        accessToken = newTokenData.accessToken;
  
        company.accessToken = encryptionService.encrypt(newTokenData.accessToken);
        company.refreshToken = encryptionService.encrypt(newTokenData.refreshToken);
        company.tokenExpiresAt = new Date(
          Date.now() + newTokenData.expiresIn * 1000
        );
  
        await company.save();
      }
  
  
      company.lastSyncedAt = new Date();
      await company.save();
  
      return res.status(200).json({
        success: true,
        message: "QuickBooks sync completed successfully",
      });
  
    } catch (error) {
      console.error("QuickBooks sync error:", error);
  
      return res.status(500).json({
        success: false,
        message: `QuickBooks sync failed: ${error.message}`,
        data: null,
      });
    }
  },
  

};

module.exports = quickbooksController;
