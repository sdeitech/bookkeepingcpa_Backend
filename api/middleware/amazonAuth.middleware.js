const AmazonSeller = require('../models/amazonSellerModel');
const amazonService = require('../services/amazon.services');
const encryptionService = require('../services/encryption.services');
const resModel = require('../lib/resModel');
const { getUserId } = require('../utils/getUserContext');

/**
 * Middleware to check if user has an active Amazon connection
 * and automatically refresh token if needed
 */
const amazonAuthMiddleware = async (req, res, next) => {
  try {
    // Use getUserId to support admin override
    const userId = getUserId(req);
    
    if (!userId) {
      return resModel.error(res, 'User authentication required', null, 401);
    }
    
    // Find Amazon seller account
    const seller = await AmazonSeller.findOne({ userId });
    
    if (!seller) {
      return resModel.error(res, 'Amazon account not connected. Please connect your Amazon seller account first.', null, 401);
    }

    if (!seller.isActive) {
      return resModel.error(res, 'Amazon account is inactive. Please reconnect your account.', null, 401);
    }

    // Check if token is expired or needs refresh
    const now = new Date();
    const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);
    
    if (seller.tokenExpiresAt <= fiveMinutesFromNow) {
      try {
        // Refresh token automatically
        console.log(`Refreshing Amazon token for user ${userId}`);
        
        const decryptedRefreshToken = encryptionService.decrypt(seller.refreshToken);
        const newTokenData = await amazonService.refreshAccessToken(decryptedRefreshToken);
        
        // Update tokens in database
        seller.accessToken = encryptionService.encrypt(newTokenData.accessToken);
        seller.tokenExpiresAt = new Date(now.getTime() + (newTokenData.expiresIn * 1000));
        seller.lastSyncedAt = new Date();
        
        await seller.save();
        
        console.log(`Successfully refreshed Amazon token for user ${userId}`);
      } catch (refreshError) {
        console.error(`Failed to refresh Amazon token for user ${userId}:`, refreshError);
        
        // Mark account as inactive if refresh fails
        seller.isActive = false;
        seller.lastError = {
          message: refreshError.message,
          code: 'TOKEN_REFRESH_FAILED',
          timestamp: new Date()
        };
        await seller.save();
        
        return resModel.error(res, 'Failed to refresh Amazon token. Please reconnect your Amazon account.', null, 401);
      }
    }

    // Attach seller data to request for use in controllers
    req.amazonSeller = seller;
    next();
  } catch (error) {
    console.error('Amazon auth middleware error:', error);
    return resModel.error(res, 'Amazon authentication failed', null, 500);
  }
};

/**
 * Optional middleware to check Amazon connection without blocking
 * Adds amazonSeller to req if connected, but doesn't fail if not
 */
const amazonAuthOptional = async (req, res, next) => {
  try {
    // Use getUserId to support admin override
    const userId = getUserId(req);
    
    if (!userId) {
      return next();
    }
    
    const seller = await AmazonSeller.findOne({ userId });
    
    if (seller && seller.isActive) {
      // Check if token needs refresh
      const now = new Date();
      const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);
      
      if (seller.tokenExpiresAt <= fiveMinutesFromNow) {
        try {
          const decryptedRefreshToken = encryptionService.decrypt(seller.refreshToken);
          const newTokenData = await amazonService.refreshAccessToken(decryptedRefreshToken);
          
          seller.accessToken = encryptionService.encrypt(newTokenData.accessToken);
          seller.tokenExpiresAt = new Date(now.getTime() + (newTokenData.expiresIn * 1000));
          await seller.save();
        } catch (refreshError) {
          console.error('Failed to refresh token in optional middleware:', refreshError);
          seller.isActive = false;
          await seller.save();
        }
      }
      
      if (seller.isActive) {
        req.amazonSeller = seller;
      }
    }
    
    next();
  } catch (error) {
    console.error('Amazon auth optional middleware error:', error);
    // Don't fail the request, just continue without Amazon data
    next();
  }
};

module.exports = {
  amazonAuthMiddleware,
  amazonAuthOptional
};