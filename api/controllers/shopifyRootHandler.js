// Handler for Shopify OAuth callback that comes to root URL
const shopifyController = require('./shopifyController');

const shopifyRootHandler = {
  handleRootCallback: async (req, res) => {
    const { hmac, host, shop, timestamp, code, state } = req.query;
    
    // Check if this is a Shopify OAuth callback
    if (shop && (hmac || code)) {
      console.log('Shopify OAuth callback received at root:', {
        shop,
        hasCode: !!code,
        hasHmac: !!hmac,
        timestamp
      });
      
      // If we have a code, this is the OAuth callback
      if (code) {
        // Forward to the actual callback handler
        return shopifyController.handleCallback(req, res);
      }
      
      // If no code but we have shop and hmac, Shopify might be doing initial redirect
      // Redirect to the actual callback endpoint
      const callbackUrl = `/api/shopify/auth/callback?${req.originalUrl.split('?')[1]}`;
      return res.redirect(callbackUrl); 
    }
    
    // Not a Shopify callback, return 404
    res.status(404).json({
      success: false,
      message: 'Route not found',
      data: null
    });
  }
};

module.exports = shopifyRootHandler;