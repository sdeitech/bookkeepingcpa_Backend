const response = require('../lib/resModel.js');
const StripeService = require('../services/stripe.service');
const SubscriptionPlan = require('../models/stripe/subscriptionPlan.model');
const UserSubscription = require('../models/stripe/userSubscription.model');
const Transaction = require('../models/stripe/transaction.model');
const BillingInfo = require('../models/stripe/billingInfo.model');
const Stripe = require('stripe');
const dotenv = require('dotenv');
const emailService = require('../services/email.service');
const User = require('../models/userModel');
const Notification = require('../models/notification');
const firebaseRealtime = require('../services/firebase.realtime.service');


dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2023-10-16',
});

// Admin: Create or update subscription plan
const createOrUpdateSubscriptionPlan = async (req, res) => {
  try {
    // Get user ID from auth middleware (req.userInfo is set by auth middleware)
    const adminId = req.userInfo?.id || req.userInfo?._id;
    
    if (!adminId) {
      return res.status(401).json({
        status: 401,
        success: false,
        message: "Unauthorized - Admin ID not found",
      });
    }
    
    // Get plan ID from URL params (for PUT requests) or body (for backward compatibility)
    const planId = req.params.id || req.body.planId;
    
    const {
      name,
      description,
      features,
      pricePerMonth,
      pricePerYear,
      trialDays,
      isPopular
    } = req.body;

    // Validation
    if (!name || !features || !pricePerMonth) {
      return res.status(400).json({
        status: 400,
        success: false,
        message: "Name, features, and pricePerMonth are required",
      });
    }

    let savedPlan;

    if (planId) {
      // Update existing plan
      const existingPlan = await SubscriptionPlan.findById(planId);
      if (!existingPlan) {
        return res.status(404).json({
          success: false,
          message: "Subscription plan not found",
        });
      }

      // Update Stripe product
      await stripe.products.update(existingPlan.stripeProductId, {
        name: name,
        description: description,
      });

      // Handle price updates
      if (existingPlan.pricePerMonth !== pricePerMonth) {
        // Create new monthly price
        const newMonthlyPrice = await stripe.prices.create({
          unit_amount: Math.round(pricePerMonth * 100),
          currency: 'usd',
          recurring: { interval: 'month' },
          product: existingPlan.stripeProductId,
        });

        existingPlan.stripePriceIdMonthly = newMonthlyPrice.id;
      }

      if (pricePerYear && existingPlan.pricePerYear !== pricePerYear) {
        // Create new yearly price
        const newYearlyPrice = await stripe.prices.create({
          unit_amount: Math.round(pricePerYear * 100),
          currency: 'usd',
          recurring: { interval: 'year' },
          product: existingPlan.stripeProductId,
        });

        existingPlan.stripePriceIdYearly = newYearlyPrice.id;
      }

      // Update plan
      existingPlan.name = name;
      existingPlan.description = description;
      existingPlan.features = features;
      existingPlan.pricePerMonth = pricePerMonth;
      existingPlan.pricePerYear = pricePerYear || pricePerMonth * 10;
      existingPlan.trialDays = trialDays;
      existingPlan.isPopular = isPopular;

      savedPlan = await existingPlan.save();

    } else {
      // Create new plan in Stripe
      const product = await stripe.products.create({
        name: name,
        description: description,
      });

      // Create monthly price
      const monthlyPrice = await stripe.prices.create({
        unit_amount: Math.round(pricePerMonth * 100),
        currency: 'usd',
        recurring: { interval: 'month' },
        product: product.id,
      });

      // Create yearly price
      const yearlyAmount = pricePerYear || pricePerMonth * 10;
      const yearlyPrice = await stripe.prices.create({
        unit_amount: Math.round(yearlyAmount * 100),
        currency: 'usd',
        recurring: { interval: 'year' },
        product: product.id,
      });

      // Create plan in database
      savedPlan = await SubscriptionPlan.create({
        name,
        description,
        features,
        pricePerMonth,
        pricePerYear: yearlyAmount,
        stripeProductId: product.id,
        stripePriceIdMonthly: monthlyPrice.id,
        stripePriceIdYearly: yearlyPrice.id,
        trialDays,
        isPopular,
        createdBy: adminId
      });
    }

    return res.status(200).json({
      status: 200,
      success: true,
      message: planId ? "Plan updated successfully" : "Plan created successfully",
      data: savedPlan,
    });

  } catch (error) {
    console.error('Error in createOrUpdateSubscriptionPlan:', error);
    return res.status(500).json({
      status: 500,
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// Fetch all subscription plans
const fetchSubscriptionPlans = async (req, res) => {
  try {
    const { planId, active } = req.query;

    let query = {};
    if (planId) {
      const plan = await SubscriptionPlan.findById(planId);
      return res.status(200).json({
        status: 200,
        success: true,
        message: "Plan fetched successfully",
        data: plan,
      });
    }

    if (active !== undefined) {
      query.isActive = active === 'true';
    }

    const plans = await SubscriptionPlan.find(query)
      .sort({ sortOrder: 1, createdAt: -1 });

    return res.status(200).json({
      status: 200,
      success: true,
      message: "Plans fetched successfully",
      data: plans,
    });

  } catch (error) {
    console.error('Error in fetchSubscriptionPlans:', error);
    return res.status(500).json({
      status: 500,
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// Create subscription....this will be used by client(seller)
const createSubscription = async (req, res) => {
  try {
    const userId = req.userInfo?.id || req.userInfo?._id;
    const { 
      planId, 
      paymentMethodId, 
      billingDetails,
      billingPeriod = 'monthly'
    } = req.body;

    // Check if user already has an active subscription
    const existingSubscription = await UserSubscription.findOne({
      userId,
      status: { $in: ['active', 'trialing'] }
    });

    if (existingSubscription) {
      return res.status(400).json({
        status: 400,
        success: false,
        message: 'User already has an active subscription',
      });
    }

    // Create subscription
    const result = await StripeService.createSubscription(
      userId,
      planId,
      paymentMethodId,
      { ...billingDetails, billingPeriod }
    );

    // If subscription is successful and active, send welcome email and create notification
    if (result.stripeSubscription.status === 'active' || result.stripeSubscription.status === 'trialing') {
      // Fetch user details for the email
      const user = await User.findById(userId);
      
      if (user) {
        // Send welcome email (don't wait for it to complete)
        emailService.sendWelcomeEmail({
          first_name: user.first_name,
          last_name: user.last_name,
          email: user.email
        }).then(emailResult => {
          if (emailResult.success) {
            console.log('Welcome email sent successfully after payment to:', user.email);
          } else {
            console.log('Failed to send welcome email after payment to:', user.email, emailResult.error);
          }
        }).catch(emailError => {
          console.error('Error sending welcome email after payment:', emailError);
        });

        // Create notification in database for the bell
        try {
          const plan = await SubscriptionPlan.findById(planId);
          const notification = new Notification({
            type: 'payment',
            title: 'Payment Successful! 🎉',
            message: `Your ${plan ? plan.name : 'subscription'} is now active. Welcome to our platform!`,
            recipientId: userId,
            senderId: userId, // Self-notification from system
            senderName: 'System',
            senderRole: 'system',
            priority: 'high',
            category: 'alert',
            actionUrl: '/dashboard',
            actionType: 'navigate',
            actionLabel: 'Go to Dashboard',
            metadata: {
              subscriptionId: result.userSubscription._id.toString(),
              planId: planId,
              planName: plan ? plan.name : 'Subscription',
              amount: result.userSubscription.amount,
              currency: result.userSubscription.currency,
              billingPeriod: billingPeriod,
              stripeSubscriptionId: result.stripeSubscription.id
            },
            relatedEntities: {
              paymentId: result.userSubscription._id
            },
            isRead: false,
            status: 'sent',
            deliveryStatus: {
              inApp: {
                sent: true,
                sentAt: new Date()
              }
            },
            tags: ['payment', 'subscription', 'welcome']
          });

          await notification.save();
          console.log('Payment notification created successfully for user:', userId);
          
          // Emit Firebase real-time signal for instant delivery
          await firebaseRealtime.emitNotificationSignal(
            userId,
            notification._id,
            'new'
          );
        } catch (notificationError) {
          console.error('Error creating payment notification:', notificationError);
          // Don't fail the payment process if notification creation fails
        }
      }
    }

    // Return comprehensive data structure for frontend
    return res.status(200).json({
      status: 200,
      success: true,
      message: 'Subscription created successfully',
      data: {
        subscription: result.userSubscription,
        subscriptionId: result.userSubscription._id,
        stripeSubscriptionId: result.stripeSubscription.id,
        status: result.stripeSubscription.status,
        clientSecret: result.stripeSubscription.clientSecret,
        paymentIntentId: result.stripeSubscription.paymentIntentId,
        paymentIntentStatus: result.stripeSubscription.paymentIntentStatus,
        requiresAction: result.stripeSubscription.requiresAction,
        isTrialing: result.stripeSubscription.isTrialing,
        currentPeriodEnd: result.stripeSubscription.currentPeriodEnd
      }
    });

  } catch (error) {
    console.error('Error in createSubscription:', error);
    return res.status(500).json({
      status: 500,
      success: false,
      message: "Failed to create subscription",
      error: error.message,
    });
  }
};

// Update subscription (upgrade/downgrade)
const updateSubscription = async (req, res) => {
  try {
    const userId = req.userInfo?.id || req.userInfo?._id;
    const { subscriptionId, newPlanId } = req.body;

    // Verify ownership
    const subscription = await UserSubscription.findOne({
      _id: subscriptionId,
      userId
    });

    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: 'Subscription not found',
      });
    }

    const updatedSubscription = await StripeService.updateSubscription(
      subscriptionId,
      newPlanId
    );

    return res.status(200).json({
      status: 200,
      success: true,
      message: 'Subscription updated successfully',
      data: updatedSubscription
    });

  } catch (error) {
    console.error('Error in updateSubscription:', error);
    return res.status(500).json({
      status: 500,
      success: false,
      message: "Failed to update subscription",
      error: error.message,
    });
  }
};

// Cancel subscription
const cancelSubscription = async (req, res) => {
  try {
    const userId = req.userInfo?.id || req.userInfo?._id;
    const { subscriptionId, cancelImmediately = false } = req.body;

    // Verify ownership
    const subscription = await UserSubscription.findOne({
      _id: subscriptionId,
      userId
    });

    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: 'Subscription not found',
      });
    }

    const cancelledSubscription = await StripeService.cancelSubscription(
      subscriptionId,
      !cancelImmediately
    );

    return res.status(200).json({
      status: 200,
      success: true,
      message: cancelImmediately ?
        'Subscription cancelled immediately' :
        'Subscription will be cancelled at period end',
      data: cancelledSubscription
    });

  } catch (error) {
    console.error('Error in cancelSubscription:', error);
    return res.status(500).json({
      status: 500,
      success: false,
      message: "Failed to cancel subscription",
      error: error.message,
    });
  }
};

// Get user subscription
const getUserSubscription = async (req, res) => {
  try {
    const userId = req.userInfo?.id || req.userInfo?._id;

    const subscription = await UserSubscription.findOne({
      userId,
      status: { $in: ['active', 'trialing', 'past_due'] }
    }).populate('subscriptionPlanId');

    return res.status(200).json({
      status: 200,
      success: true,
      message: subscription ? 'Subscription found' : 'No active subscription',
      data: subscription
    });

  } catch (error) {
    console.error('Error in getUserSubscription:', error);
    return res.status(500).json({
      status: 500,
      success: false,
      message: "Failed to fetch subscription",
      error: error.message,
    });
  }
};

// Get billing info
const getBillingInfo = async (req, res) => {
  try {
    const userId = req.userInfo?.id || req.userInfo?._id;

    const billingInfo = await BillingInfo.findOne({
      userId,
      isDefault: true
    });

    return res.status(200).json({
      status: 200,
      success: true,
      message: billingInfo ? 'Billing info found' : 'No billing info',
      data: billingInfo
    });

  } catch (error) {
    console.error('Error in getBillingInfo:', error);
    return res.status(500).json({
      status: 500,
      success: false,
      message: "Failed to fetch billing info",
      error: error.message,
    });
  }
};

// Update billing info
const updateBillingInfo = async (req, res) => {
  try {
    const userId = req.userInfo?.id || req.userInfo?._id;
    const billingDetails = req.body;

    // Get user's Stripe customer ID
    const user = await UserSubscription.findOne({ userId });
    console.log('User found:', user);
    const customerId = user?.stripeCustomerId || await StripeService.getOrCreateCustomer(userId);

    const billingInfo = await StripeService.saveBillingInfo(
      userId,
      customerId,
      billingDetails
    );

    return res.status(200).json({
      status: 200,
      success: true,
      message: 'Billing info updated successfully',
      data: billingInfo
    });

  } catch (error) {
    console.error('Error in updateBillingInfo:', error);
    return res.status(500).json({
      status: 500,
      success: false,
      message: "Failed to update billing info",
      error: error.message,
    });
  }
};

// Get transaction history
const getTransactionHistory = async (req, res) => {
  try {
    const userId = req.userInfo?.id || req.userInfo?._id;
    const { page = 1, limit = 10, status } = req.query;

    const query = { userId };
    if (status) {
      query.status = status;
    }

    const transactions = await Transaction.find(query)
      .populate('subscriptionId')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Transaction.countDocuments(query);

    return res.status(200).json({
      status: 200,
      success: true,
      message: 'Transactions fetched successfully',
      data: {
        transactions,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalTransactions: total,
          limit: parseInt(limit)
        }
      }
    });

  } catch (error) {
    console.error('Error in getTransactionHistory:', error);
    return res.status(500).json({
      status: 500,
      success: false,
      message: "Failed to fetch transactions",
      error: error.message,
    });
  }
};

// Download invoice
const downloadInvoice = async (req, res) => {
  try {
    const userId = req.userInfo?.id || req.userInfo?._id;
    const { transactionId } = req.params;

    const transaction = await Transaction.findOne({
      _id: transactionId,
      userId
    });

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    // Get invoice from Stripe
    const invoice = await stripe.invoices.retrieve(transaction.stripeInvoiceId);

    return res.status(200).json({
      status: 200,
      success: true,
      message: 'Invoice retrieved successfully',
      data: {
        invoiceUrl: invoice.hosted_invoice_url,
        invoicePdf: invoice.invoice_pdf
      }
    });

  } catch (error) {
    console.error('Error in downloadInvoice:', error);
    return res.status(500).json({
      status: 500,
      success: false,
      message: "Failed to get invoice",
      error: error.message,
    });
  }
};

// Create customer portal session
const createPortalSession = async (req, res) => {
  try {
    const userId = req.userInfo?.id || req.userInfo?._id;
    const { returnUrl } = req.body;

    // Get user's Stripe customer ID
    const subscription = await UserSubscription.findOne({ 
      userId,
      status: { $in: ['active', 'trialing', 'past_due'] }
    });

    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: 'No active subscription found'
      });
    }

    const session = await StripeService.createPortalSession(
      subscription.stripeCustomerId,
      returnUrl
    );

    return res.status(200).json({
      status: 200,
      success: true,
      message: 'Portal session created',
      data: {
        url: session.url
      }
    });

  } catch (error) {
    console.error('Error in createPortalSession:', error);
    return res.status(500).json({
      status: 500,
      success: false,
      message: "Failed to create portal session",
      error: error.message,
    });
  }
};

// Apply coupon
const applyCoupon = async (req, res) => {
  try {
    const userId = req.userInfo?.id || req.userInfo?._id;
    const { subscriptionId, couponCode } = req.body;

    // Verify ownership
    const subscription = await UserSubscription.findOne({
      _id: subscriptionId,
      userId
    });

    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: 'Subscription not found',
      });
    }

    const updatedSubscription = await StripeService.applyCoupon(
      subscriptionId,
      couponCode
    );

    return res.status(200).json({
      status: 200,
      success: true,
      message: 'Coupon applied successfully',
      data: updatedSubscription
    });

  } catch (error) {
    console.error('Error in applyCoupon:', error);
    return res.status(500).json({
      status: 500,
      success: false,
      message: error.message.includes('Invalid') ?
        'Invalid coupon code' :
        'Failed to apply coupon',
      error: error.message,
    });
  }
};

// Update payment method
const updatePaymentMethod = async (req, res) => {
  try {
    const userId = req.userInfo?.id || req.userInfo?._id;
    const { subscriptionId, paymentMethodId } = req.body;

    // Verify ownership
    const subscription = await UserSubscription.findOne({
      _id: subscriptionId,
      userId
    });

    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: 'Subscription not found',
      });
    }

    const updatedSubscription = await StripeService.updateDefaultPaymentMethod(
      subscriptionId,
      paymentMethodId
    );

    return res.status(200).json({
      status: 200,
      success: true,
      message: 'Payment method updated successfully',
      data: updatedSubscription
    });

  } catch (error) {
    console.error('Error in updatePaymentMethod:', error);
    return res.status(500).json({
      status: 500,
      success: false,
      message: "Failed to update payment method",
      error: error.message,
    });
  }
};

// Get payment methods
const getPaymentMethods = async (req, res) => {
  try {
    const userId = req.userInfo?.id || req.userInfo?._id;

    // Get user's Stripe customer ID
    const subscription = await UserSubscription.findOne({ 
      userId,
      status: { $in: ['active', 'trialing', 'past_due'] }
    });

    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: 'No active subscription found'
      });
    }

    const paymentMethods = await StripeService.listPaymentMethods(
      subscription.stripeCustomerId
    );

    return res.status(200).json({
      status: 200,
      success: true,
      message: 'Payment methods retrieved',
      data: paymentMethods
    });

  } catch (error) {
    console.error('Error in getPaymentMethods:', error);
    return res.status(500).json({
      status: 500,
      success: false,
      message: "Failed to get payment methods",
      error: error.message,
    });
  }
};

// Delete subscription plan (Admin)
const deleteSubscriptionPlan = async (req, res) => {
  try {
    const { planId } = req.params;

    // Check if plan has active subscriptions
    const activeSubscriptions = await UserSubscription.countDocuments({
      subscriptionPlanId: planId,
      status: { $in: ['active', 'trialing'] }
    });

    if (activeSubscriptions > 0) {
      return res.status(400).json({
        status: 400,
        success: false,
        message: `Cannot delete plan with ${activeSubscriptions} active subscriptions`,
      });
    }

    // Soft delete - just deactivate
    const plan = await SubscriptionPlan.findByIdAndUpdate(
      planId,
      { isActive: false },
      { new: true }
    );

    if (!plan) {
      return res.status(404).json({
        success: false,
        message: 'Plan not found',
      });
    }

    return res.status(200).json({
      status: 200,
      success: true,
      message: 'Plan deactivated successfully',
      data: plan
    });

  } catch (error) {
    console.error('Error in deleteSubscriptionPlan:', error);
    return res.status(500).json({
      status: 500,
      success: false,
      message: "Failed to delete plan",
      error: error.message,
    });
  }
};

// Export all controller functions
module.exports = {
  createOrUpdateSubscriptionPlan,
  fetchSubscriptionPlans,
  createSubscription,
  updateSubscription,
  cancelSubscription,
  getUserSubscription,
  getBillingInfo,
  updateBillingInfo,
  getTransactionHistory,
  downloadInvoice,
  createPortalSession,
  applyCoupon,
  updatePaymentMethod,
  getPaymentMethods,
  deleteSubscriptionPlan
};