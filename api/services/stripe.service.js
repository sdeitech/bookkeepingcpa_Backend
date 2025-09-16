const Stripe = require('stripe');
const dotenv = require('dotenv');
const SubscriptionPlan = require('../models/stripe/subscriptionPlan.model');
const UserSubscription = require('../models/stripe/userSubscription.model');
const Transaction = require('../models/stripe/transaction.model');
const BillingInfo = require('../models/stripe/billingInfo.model');
const User = require('../models/userModel');

dotenv.config();

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2023-10-16',
});

class StripeService {
  /**
   * Create or retrieve a Stripe customer for a user
   */
  async getOrCreateCustomer(userId, email = null) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Check if user already has a Stripe customer ID
      if (user.stripeCustomerId) {
        return user.stripeCustomerId;
      }

      // Create new Stripe customer
      const customer = await stripe.customers.create({
        email: email || user.email,
        metadata: {
          userId: userId.toString(),
          platform: 'plurify'
        }
      });

      // Save Stripe customer ID to user
      user.stripeCustomerId = customer.id;
      await user.save();

      return customer.id;
    } catch (error) {
      console.error('Error creating/retrieving customer:', error);
      throw error;
    }
  }

  /**
   * Create a payment intent for immediate payment
   */
  async createPaymentIntent(amount, customerId, metadata = {}) {
    try {
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // Convert to cents
        currency: 'usd',
        customer: customerId,
        automatic_payment_methods: {
          enabled: true,
        },
        metadata
      });

      return paymentIntent;
    } catch (error) {
      console.error('Error creating payment intent:', error);
      throw error;
    }
  }

  /**
   * Create a subscription
   */
  async createSubscription(userId, planId, paymentMethodId, billingDetails) {
    try {
      // Get subscription plan
      console.log('Fetching subscription plan for ID:', planId);
      const plan = await SubscriptionPlan.findById(planId);
      console.log('Subscription plan:', plan);
      if (!plan || !plan.isActive) {
        throw new Error('Invalid or inactive subscription plan');
      }

      // Get or create Stripe customer
      const customerId = await this.getOrCreateCustomer(userId);

      // Save billing information
      if (billingDetails) {
        await this.saveBillingInfo(userId, customerId, billingDetails);
      }

      // Attach payment method to customer
      await stripe.paymentMethods.attach(paymentMethodId, {
        customer: customerId,
      });

      // Set as default payment method
      await stripe.customers.update(customerId, {
        invoice_settings: {
          default_payment_method: paymentMethodId
        }
      });

      // Determine price ID based on billing period
      const priceId = billingDetails.billingPeriod === 'yearly' 
        ? plan.stripePriceIdYearly 
        : plan.stripePriceIdMonthly;

      // Create subscription with trial if applicable
      const subscriptionData = {
        customer: customerId,
        items: [{
          price: priceId,
        }],
        payment_behavior: 'allow_incomplete', // Changed from 'default_incomplete' to allow payment collection
        payment_settings: {
          save_default_payment_method: 'on_subscription',
          payment_method_types: ['card'] // Explicitly set payment method types
        },
        default_payment_method: paymentMethodId, // Set the default payment method
        expand: ['latest_invoice.payment_intent'],
        off_session: true,
        metadata: {
          userId: userId.toString(),
          planId: planId.toString()
        }
      };

      // Add trial period if applicable
      if (plan.trialDays > 0) {
        subscriptionData.trial_period_days = plan.trialDays;
      }

      const subscription = await stripe.subscriptions.create(subscriptionData);

      // Save subscription to database
      const userSubscription = new UserSubscription({
        userId,
        subscriptionPlanId: planId,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscription.id,
        stripePriceId: priceId,
        status: subscription.status,
        billingPeriod: billingDetails.billingPeriod || 'monthly',
        currentPeriodStart: new Date(subscription.current_period_start * 1000),
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        trialStart: subscription.trial_start ? new Date(subscription.trial_start * 1000) : null,
        trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
        paymentMethodId: paymentMethodId,
        defaultPaymentMethod: paymentMethodId
      });

      await userSubscription.save();

      // Prepare comprehensive response for frontend
      const paymentIntent = subscription.latest_invoice?.payment_intent;
      const requiresAction = subscription.status === 'incomplete' &&
                            paymentIntent?.status === 'requires_payment_method' ||
                            paymentIntent?.status === 'requires_confirmation' ||
                            paymentIntent?.status === 'requires_action';

      console.log('Subscription created:', {
        id: subscription.id,
        status: subscription.status,
        paymentIntentStatus: paymentIntent?.status,
        requiresAction,
        clientSecret: paymentIntent?.client_secret
      });

      return {
        subscription,
        userSubscription,
        stripeSubscription: {
          id: subscription.id,
          status: subscription.status,
          clientSecret: paymentIntent?.client_secret,
          paymentIntentId: paymentIntent?.id,
          paymentIntentStatus: paymentIntent?.status,
          requiresAction,
          isTrialing: subscription.status === 'trialing',
          currentPeriodEnd: subscription.current_period_end
        }
      };
    } catch (error) {
      console.error('Error creating subscription:', error);
      throw error;
    }
  }

  /**
   * Update subscription (upgrade/downgrade)
   */
  async updateSubscription(subscriptionId, newPlanId, prorationBehavior = 'create_prorations') {
    try {
      const userSubscription = await UserSubscription.findById(subscriptionId);
      if (!userSubscription) {
        throw new Error('Subscription not found');
      }

      const newPlan = await SubscriptionPlan.findById(newPlanId);
      if (!newPlan || !newPlan.isActive) {
        throw new Error('Invalid or inactive subscription plan');
      }

      // Get the Stripe subscription
      const stripeSubscription = await stripe.subscriptions.retrieve(
        userSubscription.stripeSubscriptionId
      );

      // Determine new price ID
      const newPriceId = userSubscription.billingPeriod === 'yearly'
        ? newPlan.stripePriceIdYearly
        : newPlan.stripePriceIdMonthly;

      // Update the subscription
      const updatedSubscription = await stripe.subscriptions.update(
        userSubscription.stripeSubscriptionId,
        {
          items: [{
            id: stripeSubscription.items.data[0].id,
            price: newPriceId,
          }],
          proration_behavior: prorationBehavior,
        }
      );

      // Update database
      userSubscription.subscriptionPlanId = newPlanId;
      userSubscription.stripePriceId = newPriceId;
      userSubscription.isUpgrade = true;
      await userSubscription.save();

      return updatedSubscription;
    } catch (error) {
      console.error('Error updating subscription:', error);
      throw error;
    }
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(subscriptionId, cancelAtPeriodEnd = true) {
    try {
      const userSubscription = await UserSubscription.findById(subscriptionId);
      if (!userSubscription) {
        throw new Error('Subscription not found');
      }

      let stripeSubscription;
      
      if (cancelAtPeriodEnd) {
        // Cancel at period end
        stripeSubscription = await stripe.subscriptions.update(
          userSubscription.stripeSubscriptionId,
          { cancel_at_period_end: true }
        );
        
        userSubscription.cancelAtPeriodEnd = true;
      } else {
        // Cancel immediately
        stripeSubscription = await stripe.subscriptions.cancel(
          userSubscription.stripeSubscriptionId
        );
        
        userSubscription.status = 'cancelled';
        userSubscription.cancelledAt = new Date();
      }

      await userSubscription.save();
      return stripeSubscription;
    } catch (error) {
      console.error('Error cancelling subscription:', error);
      throw error;
    }
  }

  /**
   * Pause subscription
   */
  async pauseSubscription(subscriptionId, resumeAt = null) {
    try {
      const userSubscription = await UserSubscription.findById(subscriptionId);
      if (!userSubscription) {
        throw new Error('Subscription not found');
      }

      const pauseCollection = {
        behavior: 'mark_uncollectible'
      };

      if (resumeAt) {
        pauseCollection.resumes_at = Math.floor(resumeAt.getTime() / 1000);
      }

      const stripeSubscription = await stripe.subscriptions.update(
        userSubscription.stripeSubscriptionId,
        { pause_collection: pauseCollection }
      );

      userSubscription.status = 'paused';
      userSubscription.pausedAt = new Date();
      userSubscription.resumeAt = resumeAt;
      await userSubscription.save();

      return stripeSubscription;
    } catch (error) {
      console.error('Error pausing subscription:', error);
      throw error;
    }
  }

  /**
   * Resume paused subscription
   */
  async resumeSubscription(subscriptionId) {
    try {
      const userSubscription = await UserSubscription.findById(subscriptionId);
      if (!userSubscription) {
        throw new Error('Subscription not found');
      }

      const stripeSubscription = await stripe.subscriptions.update(
        userSubscription.stripeSubscriptionId,
        { pause_collection: null }
      );

      userSubscription.status = 'active';
      userSubscription.pausedAt = null;
      userSubscription.resumeAt = null;
      await userSubscription.save();

      return stripeSubscription;
    } catch (error) {
      console.error('Error resuming subscription:', error);
      throw error;
    }
  }

  /**
   * Save billing information
   */
  async saveBillingInfo(userId, stripeCustomerId, billingDetails) {
    try {
      const billingInfo = await BillingInfo.findOneAndUpdate(
        { userId, isDefault: true },
        {
          userId,
          stripeCustomerId,
          name: billingDetails.name,
          email: billingDetails.email,
          phone: billingDetails.phone,
          address: billingDetails.address,
          taxId: billingDetails.taxId,
          companyName: billingDetails.companyName,
          isDefault: true
        },
        { upsert: true, new: true }
      );

      // Format address for Stripe - ensure it's an object with proper fields
      let formattedAddress = null;
      if (billingDetails.address) {
        // If address is already an object with the correct fields
        if (typeof billingDetails.address === 'object' && !Array.isArray(billingDetails.address)) {
          formattedAddress = {
            line1: billingDetails.address.line1 || billingDetails.address.street || '',
            line2: billingDetails.address.line2 || '',
            city: billingDetails.address.city || '',
            state: billingDetails.address.state || billingDetails.address.province || '',
            postal_code: billingDetails.address.postal_code || billingDetails.address.postalCode || billingDetails.address.zip || '',
            country: billingDetails.address.country || 'US'
          };
        }
        // If address is a string, try to parse it
        else if (typeof billingDetails.address === 'string') {
          // For simple string addresses, put it all in line1
          formattedAddress = {
            line1: billingDetails.address,
            line2: '',
            city: '',
            state: '',
            postal_code: '',
            country: 'US'
          };
        }
      }

      // Update Stripe customer with properly formatted data
      const updateData = {
        name: billingDetails.name,
        email: billingDetails.email,
        phone: billingDetails.phone
      };
      
      // Only add address if it's properly formatted
      if (formattedAddress && formattedAddress.line1) {
        updateData.address = formattedAddress;
      }
      
      // Only add tax_id_data if taxId exists
      if (billingDetails.taxId) {
        updateData.tax_id_data = [{ type: 'us_ein', value: billingDetails.taxId }];
      }

      await stripe.customers.update(stripeCustomerId, updateData);

      return billingInfo;
    } catch (error) {
      console.error('Error saving billing info:', error);
      throw error;
    }
  }

  /**
   * Create a portal session for customer self-service
   */
  async createPortalSession(customerId, returnUrl) {
    try {
      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl,
      });

      return session;
    } catch (error) {
      console.error('Error creating portal session:', error);
      throw error;
    }
  }

  /**
   * Apply a coupon to a subscription
   */
  async applyCoupon(subscriptionId, couponCode) {
    try {
      const userSubscription = await UserSubscription.findById(subscriptionId);
      if (!userSubscription) {
        throw new Error('Subscription not found');
      }

      // Validate coupon
      const coupon = await stripe.coupons.retrieve(couponCode);
      if (!coupon.valid) {
        throw new Error('Invalid coupon code');
      }

      // Apply to subscription
      const stripeSubscription = await stripe.subscriptions.update(
        userSubscription.stripeSubscriptionId,
        { coupon: couponCode }
      );

      // Save discount info
      userSubscription.discount = {
        couponCode: couponCode,
        percentOff: coupon.percent_off,
        amountOff: coupon.amount_off,
        validUntil: coupon.redeem_by ? new Date(coupon.redeem_by * 1000) : null
      };
      await userSubscription.save();

      return stripeSubscription;
    } catch (error) {
      console.error('Error applying coupon:', error);
      throw error;
    }
  }

  /**
   * Get upcoming invoice
   */
  async getUpcomingInvoice(subscriptionId) {
    try {
      const userSubscription = await UserSubscription.findById(subscriptionId);
      if (!userSubscription) {
        throw new Error('Subscription not found');
      }

      const upcomingInvoice = await stripe.invoices.retrieveUpcoming({
        subscription: userSubscription.stripeSubscriptionId,
      });

      return upcomingInvoice;
    } catch (error) {
      console.error('Error getting upcoming invoice:', error);
      throw error;
    }
  }

  /**
   * List payment methods for a customer
   */
  async listPaymentMethods(customerId, type = 'card') {
    try {
      const paymentMethods = await stripe.paymentMethods.list({
        customer: customerId,
        type: type,
      });

      return paymentMethods.data;
    } catch (error) {
      console.error('Error listing payment methods:', error);
      throw error;
    }
  }

  /**
   * Update default payment method
   */
  async updateDefaultPaymentMethod(subscriptionId, paymentMethodId) {
    try {
      const userSubscription = await UserSubscription.findById(subscriptionId);
      if (!userSubscription) {
        throw new Error('Subscription not found');
      }

      // Update Stripe subscription
      await stripe.subscriptions.update(
        userSubscription.stripeSubscriptionId,
        {
          default_payment_method: paymentMethodId
        }
      );

      // Update customer's default payment method
      await stripe.customers.update(
        userSubscription.stripeCustomerId,
        {
          invoice_settings: {
            default_payment_method: paymentMethodId
          }
        }
      );

      // Update database
      userSubscription.defaultPaymentMethod = paymentMethodId;
      await userSubscription.save();

      return userSubscription;
    } catch (error) {
      console.error('Error updating payment method:', error);
      throw error;
    }
  }

  /**
   * Process refund
   */
  async processRefund(transactionId, amount = null, reason = 'requested_by_customer') {
    try {
      const transaction = await Transaction.findById(transactionId);
      if (!transaction) {
        throw new Error('Transaction not found');
      }

      const refundAmount = amount || transaction.amount;

      const refund = await stripe.refunds.create({
        payment_intent: transaction.stripePaymentIntentId,
        amount: Math.round(refundAmount * 100), // Convert to cents
        reason: reason
      });

      // Update transaction
      transaction.status = 'refunded';
      transaction.refundedAmount = refundAmount;
      transaction.refundedAt = new Date();
      await transaction.save();

      return refund;
    } catch (error) {
      console.error('Error processing refund:', error);
      throw error;
    }
  }
}

module.exports = new StripeService();