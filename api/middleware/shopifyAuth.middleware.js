const ShopifyStore = require('../models/shopifyStoreModel');
const resModel = require('../lib/resModel');
const { getUserId } = require('../utils/getUserContext');

/**
 * Middleware to check if user has an active Shopify connection
 */
const shopifyAuthMiddleware = async (req, res, next) => {
  try {
    // Use getUserId to support admin override
    const userId = getUserId(req);
    
    if (!userId) {
      resModel.success = false;
      resModel.message = 'User authentication required';
      resModel.data = null;
      return res.status(401).json(resModel);
    }
    
    // Find active Shopify store for user
    const store = await ShopifyStore.findOne({ 
      userId, 
      isActive: true 
    });
    
    if (!store) {
      resModel.success = false;
      resModel.message = 'Shopify store not connected. Please connect your store first.';
      resModel.data = {
        connected: false,
        requiresConnection: true
      };
      return res.status(401).json(resModel);
    }
    
    // Check if store is paused
    if (store.isPaused) {
      resModel.success = false;
      resModel.message = 'Shopify store connection is paused. Please resume to continue.';
      resModel.data = {
        connected: true,
        isPaused: true,
        shopName: store.shopName
      };
      return res.status(403).json(resModel);
    }
    
    // Check if there's a critical error
    if (store.lastError && store.lastError.code === 'INVALID_TOKEN') {
      resModel.success = false;
      resModel.message = 'Shopify access token is invalid. Please reconnect your store.';
      resModel.data = {
        connected: true,
        tokenExpired: true,
        requiresReconnection: true
      };
      return res.status(401).json(resModel);
    }
    
    // Attach store data to request for use in controllers
    req.shopifyStore = store;
    next();
  } catch (error) {
    console.error('Shopify auth middleware error:', error);
    resModel.success = false;
    resModel.message = 'Shopify authentication failed';
    resModel.data = null;
    return res.status(500).json(resModel);
  }
};

/**
 * Optional middleware to check Shopify connection without blocking
 * Adds shopifyStore to req if connected, but doesn't fail if not
 */
const shopifyAuthOptional = async (req, res, next) => {
  try {
    // Use getUserId to support admin override
    const userId = getUserId(req);
    
    if (!userId) {
      return next();
    }
    
    const store = await ShopifyStore.findOne({ 
      userId, 
      isActive: true 
    });
    
    if (store && !store.isPaused) {
      req.shopifyStore = store;
    }
    
    next();
  } catch (error) {
    console.error('Shopify auth optional middleware error:', error);
    // Don't fail the request, just continue without Shopify data
    next();
  }
};

module.exports = {
  shopifyAuthMiddleware,
  shopifyAuthOptional
};