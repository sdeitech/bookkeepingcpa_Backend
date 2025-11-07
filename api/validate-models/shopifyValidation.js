const Joi = require('joi');

module.exports = {
  /**
   * Validation for authorize endpoint
   * GET /api/shopify/auth/authorize?shop=mystore.myshopify.com
   */
  authorize: Joi.object({
    shop: Joi.string()
      .pattern(/^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/)
      .required()
      .messages({
        'string.pattern.base': 'Shop must be a valid Shopify domain (e.g., store-name.myshopify.com)',
        'string.empty': 'Shop domain is required',
        'any.required': 'Shop domain is required'
      })
  }),
  
  /**
   * Validation for OAuth callback
   * GET /api/shopify/auth/callback
   */
  callback: Joi.object({
    code: Joi.string().required(),
    state: Joi.string().required(),
    shop: Joi.string().required(),
    hmac: Joi.string(),
    timestamp: Joi.string(),
    host: Joi.string(),
    // Error parameters (in case of failure)
    error: Joi.string(),
    error_description: Joi.string()
  }),
  
  /**
   * Validation for get orders endpoint
   * GET /api/shopify/orders
   */
  getOrders: Joi.object({
    // Admin override parameter (optional)
    clientId: Joi.string().optional()
      .messages({
        'string.base': 'Client ID must be a valid string'
      }),
    
    // Order status filter
    status: Joi.string()
      .valid('open', 'closed', 'cancelled', 'any')
      .default('any')
      .messages({
        'any.only': 'Status must be one of: open, closed, cancelled, or any'
      }),
    
    // Pagination limit
    limit: Joi.number()
      .integer()
      .min(1)
      .max(250)
      .default(50)
      .messages({
        'number.min': 'Limit must be at least 1',
        'number.max': 'Limit cannot exceed 250 (Shopify API limit)'
      }),
    
    // Date filters
    createdAfter: Joi.date()
      .iso()
      .messages({
        'date.format': 'createdAfter must be a valid ISO date'
      }),
    
    createdBefore: Joi.date()
      .iso()
      .messages({
        'date.format': 'createdBefore must be a valid ISO date'
      }),
    
    // Field selection (comma-separated)
    fields: Joi.string()
      .pattern(/^[a-zA-Z_]+(,[a-zA-Z_]+)*$/)
      .messages({
        'string.pattern.base': 'Fields must be comma-separated field names (e.g., id,email,total_price)'
      }),
    
    // Pagination token
    page_info: Joi.string()
      .messages({
        'string.base': 'page_info must be a valid pagination token'
      })
  }),
  
  /**
   * Validation for status endpoint
   * GET /api/shopify/auth/status
   * No parameters required (uses auth from JWT)
   */
  status: Joi.object({
    // Admin override parameter (optional)
    clientId: Joi.string().optional()
  }),
  
  /**
   * Validation for disconnect endpoint
   * DELETE /api/shopify/auth/disconnect
   * No parameters required (uses auth from JWT)
   */
  disconnect: Joi.object({
    // Admin override parameter (optional)
    clientId: Joi.string().optional()
  })
};