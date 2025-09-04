const Joi = require('joi');

const amazonValidation = {
  // OAuth callback validation
  callback: Joi.object({
    code: Joi.string().required().messages({
      'string.base': 'Authorization code must be a string',
      'string.empty': 'Authorization code cannot be empty',
      'any.required': 'Authorization code is required'
    }),
    state: Joi.string().uuid().required().messages({
      'string.base': 'State must be a string',
      'string.guid': 'State must be a valid UUID',
      'any.required': 'State is required'
    }),
    error: Joi.string().optional(),
    error_description: Joi.string().optional()
  }),

  // Get orders validation
  getOrders: Joi.object({
    marketplaceId: Joi.string().optional().messages({
      'string.base': 'Marketplace ID must be a string'
    }),
    createdAfter: Joi.date().iso().optional().messages({
      'date.base': 'Created after must be a valid date',
      'date.format': 'Created after must be in ISO format'
    }),
    createdBefore: Joi.date().iso().optional().messages({
      'date.base': 'Created before must be a valid date',
      'date.format': 'Created before must be in ISO format'
    }),
    orderStatuses: Joi.array().items(
      Joi.string().valid('Unshipped', 'PartiallyShipped', 'Shipped', 'Canceled', 'Unfulfillable')
    ).optional().messages({
      'array.base': 'Order statuses must be an array',
      'any.only': 'Invalid order status'
    }),
    maxResults: Joi.number().integer().min(1).max(100).optional().messages({
      'number.base': 'Max results must be a number',
      'number.min': 'Max results must be at least 1',
      'number.max': 'Max results cannot exceed 100'
    })
  }),

  // Get inventory validation
  getInventory: Joi.object({
    marketplaceId: Joi.string().optional().messages({
      'string.base': 'Marketplace ID must be a string'
    }),
    skus: Joi.array().items(Joi.string()).optional().messages({
      'array.base': 'SKUs must be an array',
      'string.base': 'Each SKU must be a string'
    })
  }),

  // Get financial events validation
  getFinancialEvents: Joi.object({
    postedAfter: Joi.date().iso().optional().messages({
      'date.base': 'Posted after must be a valid date',
      'date.format': 'Posted after must be in ISO format'
    }),
    postedBefore: Joi.date().iso().optional().messages({
      'date.base': 'Posted before must be a valid date',
      'date.format': 'Posted before must be in ISO format'
    }),
    maxResults: Joi.number().integer().min(1).max(100).optional().messages({
      'number.base': 'Max results must be a number',
      'number.min': 'Max results must be at least 1',
      'number.max': 'Max results cannot exceed 100'
    })
  }),

  // Create report validation
  createReport: Joi.object({
    reportType: Joi.string().required().valid(
      'GET_FLAT_FILE_OPEN_LISTINGS_DATA',
      'GET_MERCHANT_LISTINGS_ALL_DATA',
      'GET_MERCHANT_LISTINGS_DATA',
      'GET_MERCHANT_LISTINGS_INACTIVE_DATA',
      'GET_MERCHANT_LISTINGS_DATA_BACK_COMPAT',
      'GET_MERCHANT_LISTINGS_DATA_LITE',
      'GET_MERCHANT_LISTINGS_DATA_LITER',
      'GET_MERCHANT_CANCELLED_LISTINGS_DATA',
      'GET_FLAT_FILE_ACTIONABLE_ORDER_DATA_SHIPPING',
      'GET_AMAZON_FULFILLED_SHIPMENTS_DATA_GENERAL',
      'GET_FBA_FULFILLMENT_REMOVAL_ORDER_DETAIL_DATA',
      'GET_FBA_FULFILLMENT_REMOVAL_SHIPMENT_DETAIL_DATA',
      'GET_FLAT_FILE_RETURNS_DATA_BY_RETURN_DATE',
      'GET_XML_RETURNS_DATA_BY_RETURN_DATE',
      'GET_FLAT_FILE_ALL_ORDERS_DATA_BY_LAST_UPDATE_GENERAL',
      'GET_FLAT_FILE_ALL_ORDERS_DATA_BY_ORDER_DATE_GENERAL',
      'GET_VENDOR_INVENTORY_REPORT',
      'GET_VENDOR_SALES_REPORT',
      'GET_VENDOR_TRAFFIC_REPORT'
    ).messages({
      'string.base': 'Report type must be a string',
      'string.empty': 'Report type cannot be empty',
      'any.required': 'Report type is required',
      'any.only': 'Invalid report type'
    }),
    dataStartTime: Joi.date().iso().optional().messages({
      'date.base': 'Data start time must be a valid date',
      'date.format': 'Data start time must be in ISO format'
    }),
    dataEndTime: Joi.date().iso().optional().messages({
      'date.base': 'Data end time must be a valid date',
      'date.format': 'Data end time must be in ISO format'
    })
  }),

  // Get report document validation
  getReportDocument: Joi.object({
    reportDocumentId: Joi.string().required().messages({
      'string.base': 'Report document ID must be a string',
      'string.empty': 'Report document ID cannot be empty',
      'any.required': 'Report document ID is required'
    })
  })
};

module.exports = amazonValidation;