const authMiddleware = require('../middleware/auth');
const stripeController = require('../controllers/stripeController');
const stripeWebhookController = require('../controllers/stripeWebhookController');
const express = require('express');
const bodyParser = require('body-parser');

module.exports = function(app, validator) {
  
  // Create body parser middleware instances for non-webhook routes
  const jsonParser = bodyParser.json({ limit: '100mb' });
  const urlencodedParser = bodyParser.urlencoded({ extended: true });
  
  // ==================== WEBHOOK ROUTE ====================
  // This route needs raw body for signature verification - NO body parser
  app.post('/api/stripe/webhook',
    express.raw({
      type: 'application/json',
      limit: '10mb'
    }),
    stripeWebhookController.handleStripeWebhook
  );
  
  // ==================== PUBLIC ROUTES ====================
  // Get all active subscription plans (public - no auth required for viewing plans)
  app.get('/api/stripe/subscription-plans', jsonParser, stripeController.fetchSubscriptionPlans);
  
  // ==================== USER ROUTES (Require authentication) ====================
  // User Subscription management
  app.get('/api/stripe/subscription', jsonParser, authMiddleware, stripeController.getUserSubscription);
  app.post('/api/stripe/create-subscription', jsonParser, authMiddleware, stripeController.createSubscription);
  app.put('/api/stripe/update-subscription', jsonParser, authMiddleware, stripeController.updateSubscription);
  app.post('/api/stripe/cancel-subscription', jsonParser, authMiddleware, stripeController.cancelSubscription);
  
  // Billing management
  app.get('/api/stripe/billing-info', jsonParser, authMiddleware, stripeController.getBillingInfo);
  app.put('/api/stripe/billing-info', jsonParser, authMiddleware, stripeController.updateBillingInfo);
  
  // Transaction history
  app.get('/api/stripe/payment-history', jsonParser, authMiddleware, stripeController.getTransactionHistory);
  
  // Payment methods
  app.get('/api/stripe/payment-methods', jsonParser, authMiddleware, stripeController.getPaymentMethods);
  app.post('/api/stripe/update-payment-method', jsonParser, authMiddleware, stripeController.updatePaymentMethod);
  
  // Customer portal
  app.post('/api/stripe/create-portal-session', jsonParser, authMiddleware, stripeController.createPortalSession);
  
  // Coupons
  app.post('/api/stripe/apply-coupon', jsonParser, authMiddleware, stripeController.applyCoupon);
  
  // Invoices
  app.get('/api/stripe/invoices/:id/download', jsonParser, authMiddleware, stripeController.downloadInvoice);
  
  // ==================== ADMIN ONLY ROUTES ====================
  // Plan management (Only Admin can create/edit/delete plans - Staff has no role in payments)
  app.post('/api/stripe/subscription-plans', jsonParser, authMiddleware, authMiddleware.requireAdmin, stripeController.createOrUpdateSubscriptionPlan);
  app.put('/api/stripe/subscription-plans/:id', jsonParser, authMiddleware, authMiddleware.requireAdmin, stripeController.createOrUpdateSubscriptionPlan);
  app.delete('/api/stripe/subscription-plans/:id', jsonParser, authMiddleware, authMiddleware.requireAdmin, stripeController.deleteSubscriptionPlan);
};