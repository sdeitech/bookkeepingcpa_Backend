const QuickBooksCompany = require('../models/quickbooksCompanyModel');
const quickbooksService = require('../services/quickbooks.service');
const encryptionService = require('../services/encryption.services');
const resModel = require('../lib/resModel');
const { getUserId } = require('../utils/getUserContext');

/**
 * Middleware to check QuickBooks connection and refresh token if needed
 * Attaches quickbooksCompany to req for use in controllers
 */
const quickbooksAuthMiddleware = async (req, res, next) => {
  try {
    // Use getUserId to support admin override
    const userId = getUserId(req);
    
    if (!userId) {
      resModel.success = false;
      resModel.message = 'User authentication required';
      resModel.data = null;
      return res.status(401).json(resModel);
    }
    
    // Find QuickBooks company for user
    const company = await QuickBooksCompany.findOne({ userId });
    
    if (!company) {
      resModel.success = false;
      resModel.message = 'QuickBooks account not connected. Please connect your QuickBooks account first.';
      resModel.data = null;
      return res.status(404).json(resModel);
    }
    
    if (!company.isActive) {
      resModel.success = false;
      resModel.message = 'QuickBooks connection is inactive. Please reconnect your account.';
      resModel.data = null;
      return res.status(403).json(resModel);
    }

    if (company.isPaused) {
      resModel.success = false;
      resModel.message = 'QuickBooks connection is paused. Please resume to continue.';
      resModel.data = null;
      return res.status(403).json(resModel);
    }
    
    // Check if token needs refresh
    if (company.needsTokenRefresh) {
      try {
        console.log('🔄 QuickBooks token needs refresh, refreshing...');
        const decryptedRefreshToken = encryptionService.decrypt(company.refreshToken);
        const newTokenData = await quickbooksService.refreshAccessToken(decryptedRefreshToken);
        
        // Update tokens in database
        company.accessToken = encryptionService.encrypt(newTokenData.accessToken);
        company.refreshToken = encryptionService.encrypt(newTokenData.refreshToken);
        company.tokenExpiresAt = new Date(Date.now() + (newTokenData.expiresIn * 1000));
        await company.save();
        
        console.log('✅ QuickBooks token refreshed successfully');
      } catch (refreshError) {
        console.error('❌ Failed to refresh QuickBooks token:', refreshError);
        
        // Mark connection as inactive
        company.isActive = false;

        await company.recordError(refreshError);
        
        resModel.success = false;
        resModel.message = 'Failed to refresh QuickBooks access token. Please reconnect your account.';
        resModel.data = null;
        return res.status(401).json(resModel);
      }
    }
    
    // Attach company data to request for use in controllers
    req.quickbooksCompany = company;
    next();
  } catch (error) {
    console.error('QuickBooks auth middleware error:', error);
    resModel.success = false;
    resModel.message = `QuickBooks authentication failed: ${error.message}`;
    resModel.data = null;
    return res.status(500).json(resModel);
  }
};

/**
 * Optional middleware to check QuickBooks connection without blocking
 * Adds quickbooksCompany to req if connected, but doesn't fail if not
 */
const quickbooksAuthOptional = async (req, res, next) => {
  try {
    // Use getUserId to support admin override
    const userId = getUserId(req);
    
    if (!userId) {
      // No user authentication, continue without QuickBooks
      return next();
    }
    
    // Find QuickBooks company for user
    const company = await QuickBooksCompany.findOne({ userId });
    
    if (company && company.isActive && !company.isPaused) {
      // Check if token needs refresh
      if (company.needsTokenRefresh) {
        try {
          const decryptedRefreshToken = encryptionService.decrypt(company.refreshToken);
          const newTokenData = await quickbooksService.refreshAccessToken(decryptedRefreshToken);
          
          // Update tokens in database
          company.accessToken = encryptionService.encrypt(newTokenData.accessToken);
          company.refreshToken = encryptionService.encrypt(newTokenData.refreshToken);
          company.tokenExpiresAt = new Date(Date.now() + (newTokenData.expiresIn * 1000));
          await company.save();
        } catch (refreshError) {
          console.error('Failed to refresh QuickBooks token (optional):', refreshError);
          // Continue without QuickBooks
          return next();
        }
      }
      
      req.quickbooksCompany = company;
    }
    
    next();
  } catch (error) {
    console.error('QuickBooks optional auth middleware error:', error);
    // Continue without QuickBooks on error
    next();
  }
};

module.exports = {
  quickbooksAuthMiddleware,
  quickbooksAuthOptional
};