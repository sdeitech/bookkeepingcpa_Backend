// Test controller to verify Shopify OAuth URL generation
const resModel = require('../lib/resModel');

const testShopifyController = {
  testAuthUrl: async (req, res) => {
    const { shop } = req.query;
    
    // Build test authorization URL
    const clientId = process.env.SHOPIFY_CLIENT_ID || 'test-client-id';
    const redirectUri = `${process.env.SHOPIFY_APP_URL || 'http://localhost:8080'}/api/shopify/auth/callback`;
    const scopes = process.env.SHOPIFY_SCOPES || 'read_orders';
    const state = 'test-state-' + Date.now();
    
    const authUrl = `https://${shop || 'test-shop.myshopify.com'}/admin/oauth/authorize?` +
      `client_id=${clientId}&` +
      `scope=${scopes}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `state=${state}&` +
      `grant_options[]=per-user`;
    
    resModel.success = true;
    resModel.message = 'Test auth URL generated';
    resModel.data = {
      authUrl,
      state,
      config: {
        clientId,
        redirectUri,
        scopes,
        shop: shop || 'test-shop.myshopify.com'
      }
    };
    
    return res.status(200).json(resModel);
  }
};

module.exports = testShopifyController;