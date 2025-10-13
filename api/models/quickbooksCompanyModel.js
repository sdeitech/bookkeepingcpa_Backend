const mongoose = require("mongoose");

const quickbooksCompanySchema = new mongoose.Schema(
  {
    // User Association
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true // One QuickBooks connection per user
    },
    
    // QuickBooks Company Information (from API)
    companyId: {
      type: String,
      required: true,
      unique: true,
      index: true
    }, // Also known as realmId
    companyName: {
      type: String,
      required: true
    },
    companyType: {
      type: String // Company, Self-employed, etc.
    },
    legalName: String,
    companyEmail: String,
    companyPhone: String,
    companyAddress: {
      line1: String,
      city: String,
      state: String,
      postalCode: String,
      country: String
    },
    
    // OAuth Tokens (Encrypted)
    accessToken: {
      type: String,
      required: true
    },
    refreshToken: {
      type: String,
      required: true
    },
    tokenExpiresAt: {
      type: Date,
      required: true
    },
    refreshTokenExpiresAt: {
      type: Date // 100 days for QuickBooks
    },
    
    // Company Settings
    fiscalYearStartMonth: Number,
    taxYearStartMonth: Number,
    baseCurrency: {
      type: String,
      default: 'USD'
    },
    multiCurrencyEnabled: {
      type: Boolean,
      default: false
    },
    
    // Connection Status
    isActive: {
      type: Boolean,
      default: true
    },
    isSandbox: {
      type: Boolean,
      default: process.env.QUICKBOOKS_ENVIRONMENT === 'sandbox'
    },
    isPaused: {
      type: Boolean,
      default: false
    },
    
    // Sync Information
    lastSyncedAt: Date,
    lastFullSyncAt: Date,
    lastInvoiceSync: Date,
    lastExpenseSync: Date,
    lastReportSync: Date,
    
    // Permissions/Features
    permissions: {
      invoices: { type: Boolean, default: true },
      bills: { type: Boolean, default: true },
      expenses: { type: Boolean, default: true },
      customers: { type: Boolean, default: true },
      vendors: { type: Boolean, default: true },
      employees: { type: Boolean, default: true },
      payroll: { type: Boolean, default: false },
      reports: { type: Boolean, default: true },
      taxForms: { type: Boolean, default: true },
      journalEntries: { type: Boolean, default: true }
    },
    
    // Webhook Configuration
    webhookId: String,
    webhookSecret: String,
    webhooksEnabled: {
      type: Boolean,
      default: false
    },
    
    // Error Tracking
    lastError: {
      message: String,
      code: String,
      timestamp: Date,
      details: mongoose.Schema.Types.Mixed
    },
    
    // Statistics
    stats: {
      totalInvoices: { type: Number, default: 0 },
      totalBills: { type: Number, default: 0 },
      totalCustomers: { type: Number, default: 0 },
      totalVendors: { type: Number, default: 0 },
      totalExpenses: { type: Number, default: 0 },
      lastInvoiceDate: Date,
      lastBillDate: Date,
      lastExpenseDate: Date,
      lastReportGenerated: Date
    }
  },
  {
    timestamps: true
  }
);

// Indexes for performance
quickbooksCompanySchema.index({ userId: 1, isActive: 1 });
quickbooksCompanySchema.index({ companyId: 1 });
quickbooksCompanySchema.index({ isSandbox: 1 });

// Virtual to check if token needs refresh (expires in 1 hour)
quickbooksCompanySchema.virtual('needsTokenRefresh').get(function() {
  const tenMinutesFromNow = new Date(Date.now() + 10 * 60 * 1000);
  return this.tokenExpiresAt < tenMinutesFromNow;
});

// Method to update last synced time
quickbooksCompanySchema.methods.updateLastSynced = function() {
  this.lastSyncedAt = new Date();
  return this.save();
};

// Method to deactivate
quickbooksCompanySchema.methods.deactivate = function() {
  this.isActive = false;
  return this.save();
};

// Method to activate
quickbooksCompanySchema.methods.activate = function() {
  this.isActive = true;
  return this.save();
};

// Method to pause (temporary deactivation)
quickbooksCompanySchema.methods.pause = function() {
  this.isPaused = true;
  return this.save();
};

// Method to resume
quickbooksCompanySchema.methods.resume = function() {
  this.isPaused = false;
  return this.save();
};

// Method to record error
quickbooksCompanySchema.methods.recordError = function(error) {
  this.lastError = {
    message: error.message || 'Unknown error',
    code: error.code || 'UNKNOWN',
    timestamp: new Date(),
    details: error
  };
  return this.save();
};

// Method to clear error
quickbooksCompanySchema.methods.clearError = function() {
  this.lastError = undefined;
  return this.save();
};

module.exports = mongoose.model("QuickBooksCompany", quickbooksCompanySchema);