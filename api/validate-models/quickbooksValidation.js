const Joi = require('joi');

const quickbooksValidation = {
  /**
   * OAuth callback validation
   * GET /api/quickbooks/auth/callback
   */
  callback: Joi.object({
    code: Joi.string().required().messages({
      'string.empty': 'Authorization code is required',
      'any.required': 'Authorization code is required'
    }),
    state: Joi.string().required().messages({
      'string.empty': 'State parameter is required',
      'any.required': 'State parameter is required'
    }),
    realmId: Joi.string().required().messages({
      'string.empty': 'Realm ID (Company ID) is required',
      'any.required': 'Realm ID (Company ID) is required'
    }),
    error: Joi.string().optional()
  }),

  /**
   * Get invoices validation
   * GET /api/quickbooks/invoices
   */
  getInvoices: Joi.object({
    // Admin override parameter (optional)
    clientId: Joi.string().optional().messages({
      'string.base': 'Client ID must be a valid string'
    }),
    startDate: Joi.date().iso().optional().messages({
      'date.format': 'Start date must be in ISO format (YYYY-MM-DD)'
    }),
    endDate: Joi.date().iso().optional().messages({
      'date.format': 'End date must be in ISO format (YYYY-MM-DD)'
    }),
    customerRef: Joi.string().optional(),
    limit: Joi.number().integer().min(1).max(1000).optional().messages({
      'number.min': 'Limit must be at least 1',
      'number.max': 'Limit cannot exceed 1000'
    }),
    orderBy: Joi.string().optional()
  }),

  /**
   * Get customers validation
   * GET /api/quickbooks/customers
   */
  getCustomers: Joi.object({
    // Admin override parameter (optional)
    clientId: Joi.string().optional(),
    startDate: Joi.date().iso().optional(),
    endDate: Joi.date().iso().optional(),
    active: Joi.boolean().optional(),
    limit: Joi.number().integer().min(1).max(1000).optional(),
    orderBy: Joi.string().optional()
  }),

  /**
   * Get expenses validation
   * GET /api/quickbooks/expenses
   */
  getExpenses: Joi.object({
    // Admin override parameter (optional)
    clientId: Joi.string().optional(),
    startDate: Joi.date().iso().optional(),
    endDate: Joi.date().iso().optional(),
    limit: Joi.number().integer().min(1).max(1000).optional(),
    orderBy: Joi.string().optional()
  }),

  /**
   * Get vendors validation
   * GET /api/quickbooks/vendors
   */
  getVendors: Joi.object({
    // Admin override parameter (optional)
    clientId: Joi.string().optional(),
    startDate: Joi.date().iso().optional(),
    endDate: Joi.date().iso().optional(),
    active: Joi.boolean().optional(),
    limit: Joi.number().integer().min(1).max(1000).optional(),
    orderBy: Joi.string().optional()
  }),

  /**
   * Get bills validation
   * GET /api/quickbooks/bills
   */
  getBills: Joi.object({
    // Admin override parameter (optional)
    clientId: Joi.string().optional(),
    startDate: Joi.date().iso().optional(),
    endDate: Joi.date().iso().optional(),
    limit: Joi.number().integer().min(1).max(1000).optional(),
    orderBy: Joi.string().optional()
  }),

  /**
   * Report validation
   * GET /api/quickbooks/reports/*
   */
  getReport: Joi.object({
    // Admin override parameter (optional)
    clientId: Joi.string().optional(),
    startDate: Joi.date().iso().required().messages({
      'date.format': 'Start date must be in ISO format (YYYY-MM-DD)',
      'any.required': 'Start date is required for reports'
    }),
    endDate: Joi.date().iso().required().messages({
      'date.format': 'End date must be in ISO format (YYYY-MM-DD)',
      'any.required': 'End date is required for reports'
    }),
    summarizeBy: Joi.string().valid('Total', 'Month', 'Week', 'Day').optional()
  }),

  /**
   * Create invoice validation
   * POST /api/quickbooks/invoices
   */
  createInvoice: Joi.object({
    CustomerRef: Joi.object({
      value: Joi.string().required()
    }).required().messages({
      'any.required': 'Customer reference is required'
    }),
    Line: Joi.array().items(
      Joi.object({
        Amount: Joi.number().positive().required(),
        DetailType: Joi.string().required(),
        SalesItemLineDetail: Joi.object({
          ItemRef: Joi.object({
            value: Joi.string().required(),
            name: Joi.string().optional()
          })
        }).optional(),
        Description: Joi.string().optional()
      })
    ).min(1).required().messages({
      'array.min': 'At least one line item is required',
      'any.required': 'Line items are required'
    }),
    DueDate: Joi.date().iso().optional(),
    TxnDate: Joi.date().iso().optional(),
    PrivateNote: Joi.string().optional(),
    CustomerMemo: Joi.object({
      value: Joi.string()
    }).optional()
  }),

  /**
   * Create customer validation
   * POST /api/quickbooks/customers
   */
  createCustomer: Joi.object({
    DisplayName: Joi.string().required().messages({
      'string.empty': 'Display name is required',
      'any.required': 'Display name is required'
    }),
    GivenName: Joi.string().optional(),
    FamilyName: Joi.string().optional(),
    CompanyName: Joi.string().optional(),
    PrimaryEmailAddr: Joi.object({
      Address: Joi.string().email()
    }).optional(),
    PrimaryPhone: Joi.object({
      FreeFormNumber: Joi.string()
    }).optional(),
    BillAddr: Joi.object({
      Line1: Joi.string(),
      City: Joi.string(),
      CountrySubDivisionCode: Joi.string(),
      PostalCode: Joi.string(),
      Country: Joi.string()
    }).optional()
  }),

  /**
   * Create expense validation
   * POST /api/quickbooks/expenses
   */
  createExpense: Joi.object({
    PaymentType: Joi.string().valid('Cash', 'Check', 'CreditCard').required(),
    AccountRef: Joi.object({
      value: Joi.string().required()
    }).required(),
    TotalAmt: Joi.number().positive().required(),
    TxnDate: Joi.date().iso().optional(),
    Line: Joi.array().items(
      Joi.object({
        Amount: Joi.number().positive().required(),
        DetailType: Joi.string().required(),
        AccountBasedExpenseLineDetail: Joi.object({
          AccountRef: Joi.object({
            value: Joi.string().required()
          })
        }).optional(),
        Description: Joi.string().optional()
      })
    ).min(1).required()
  }),

  /**
   * Webhook validation
   * POST /api/quickbooks/webhooks
   */
  webhook: Joi.object({
    eventNotifications: Joi.array().items(
      Joi.object({
        realmId: Joi.string().required(),
        dataChangeEvent: Joi.object({
          entities: Joi.array().items(
            Joi.object({
              name: Joi.string().required(),
              id: Joi.string().required(),
              operation: Joi.string().valid('Create', 'Update', 'Delete').required(),
              lastUpdated: Joi.string().required()
            })
          )
        })
      })
    ).required()
  })
};

module.exports = quickbooksValidation;