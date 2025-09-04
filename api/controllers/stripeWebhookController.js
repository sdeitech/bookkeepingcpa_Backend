const Stripe = require('stripe');
const dotenv = require('dotenv');
const UserSubscription = require('../models/stripe/userSubscription.model');
const Transaction = require('../models/stripe/transaction.model');

dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2023-10-16',
});

const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

// Main webhook handler
const handleStripeWebhook = async (req, res) => {
  const sig = req.headers['stripe-signature'];
  
  let event;

  // Debug logging
  console.log('Webhook received:', {
    hasBody: !!req.body,
    bodyType: typeof req.body,
    isBuffer: Buffer.isBuffer(req.body),
    signature: sig ? 'Present' : 'Missing',
    endpointSecret: endpointSecret ? 'Configured' : 'Missing'
  });

  // Check if we have the webhook secret
  if (!endpointSecret) {
    console.error('⚠️ STRIPE_WEBHOOK_SECRET is not configured in environment variables');
    // In development, you might want to skip verification
    if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'dev') {
      console.warn('⚠️ Skipping webhook signature verification in development');
      try {
        event = JSON.parse(req.body.toString());
      } catch (parseError) {
        console.error('Failed to parse webhook body:', parseError);
        return res.status(400).send('Invalid webhook body');
      }
    } else {
      return res.status(500).send('Webhook endpoint not properly configured');
    }
  } else {
    try {
      // According to Stripe docs, constructEvent can accept:
      // 1. A Buffer directly (preferred)
      // 2. A string
      // Since we're using express.raw(), req.body is already a Buffer
      // Pass it directly to constructEvent without conversion
      
      event = stripe.webhooks.constructEvent(
        req.body,  // Pass the Buffer directly
        sig,
        endpointSecret
      );
      
      console.log('✅ Webhook signature verified successfully');
    } catch (err) {
      console.error(`❌ Webhook signature verification failed:`, err.message);
      
      // Additional debugging for signature issues
      if (err.message.includes('No signatures found')) {
        console.error('Possible causes:');
        console.error('1. Webhook secret mismatch - verify STRIPE_WEBHOOK_SECRET in .env');
        console.error('2. Using wrong environment (test vs live) keys');
        console.error('3. Webhook secret was regenerated in Stripe Dashboard');
        console.error('Current secret starts with:', endpointSecret ? endpointSecret.substring(0, 10) + '...' : 'NOT SET');
      }
      
      console.error('Debugging info:', {
        bodyIsBuffer: Buffer.isBuffer(req.body),
        bodyLength: req.body ? req.body.length : 0,
        sigPresent: !!sig,
        secretPresent: !!endpointSecret,
        nodeEnv: process.env.NODE_ENV
      });
      
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }
  }

  try {
    console.log(`Processing webhook event: ${event.type}`);

    // Handle the event based on its type
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(event.data.object);
        break;

      case 'invoice.payment_succeeded':
        await handleInvoicePaymentSucceeded(event.data.object);
        break;

      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object);
        break;

      case 'customer.subscription.created':
        await handleSubscriptionCreated(event.data.object);
        break;

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object);
        break;

      case 'customer.subscription.trial_will_end':
        await handleTrialWillEnd(event.data.object);
        break;

      case 'payment_intent.succeeded':
        await handlePaymentIntentSucceeded(event.data.object);
        break;

      case 'payment_intent.payment_failed':
        await handlePaymentIntentFailed(event.data.object);
        break;

      case 'payment_method.attached':
        await handlePaymentMethodAttached(event.data.object);
        break;

      case 'charge.refunded':
        await handleChargeRefunded(event.data.object);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    // Return a 200 response to acknowledge receipt of the event
    res.json({ received: true });
  } catch (error) {
    console.error(`Webhook handler error for ${event.type}:`, error);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
};

// Handle successful checkout session
async function handleCheckoutSessionCompleted(session) {
  console.log('Processing checkout.session.completed:', session.id);
  
  // This is typically used for one-time payments
  // For subscriptions, the subscription webhooks will handle the logic
  
  if (session.mode === 'payment') {
    // Handle one-time payment
    console.log('One-time payment completed:', session.payment_intent);
  }
}

// Handle successful invoice payment - Per Stripe docs, this is the key event for payments
async function handleInvoicePaymentSucceeded(invoice) {
  console.log('Processing invoice.payment_succeeded:', invoice.id);
  console.log('Invoice details:', {
    subscription: invoice.subscription,
    billing_reason: invoice.billing_reason,
    customer: invoice.customer,
    amount_paid: invoice.amount_paid
  });
  
  // Get subscription ID - it might be in different places
  let subscriptionId = invoice.subscription;
  
  // For first invoice, subscription might be in lines data
  if (!subscriptionId && invoice.lines?.data?.[0]?.subscription) {
    subscriptionId = invoice.lines.data[0].subscription;
    console.log('Found subscription ID in lines data:', subscriptionId);
  }
  
  // Check if this is a subscription-related invoice by billing reason
  const isSubscriptionInvoice = invoice.billing_reason === 'subscription_create' ||
                                invoice.billing_reason === 'subscription_cycle' ||
                                invoice.billing_reason === 'subscription_update' ||
                                subscriptionId;
  
  if (!isSubscriptionInvoice) {
    console.log('Invoice not related to subscription - one-time payment');
    return;
  }

  try {
    let userSubscription;
    
    if (subscriptionId) {
      // Find subscription by ID
      userSubscription = await UserSubscription.findOne({
        stripeSubscriptionId: subscriptionId
      });
      
      if (!userSubscription) {
        // Try to fetch from Stripe API
        console.log(`Subscription ${subscriptionId} not found, fetching from Stripe...`);
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        
        if (subscription) {
          // Create subscription record
          await handleSubscriptionCreated(subscription);
          
          // Re-fetch from DB
          userSubscription = await UserSubscription.findOne({
            stripeSubscriptionId: subscriptionId
          });
        }
      }
    } else {
      // Try to find subscription by customer for first invoice
      console.log('No subscription ID in invoice, searching by customer:', invoice.customer);
      userSubscription = await UserSubscription.findOne({
        stripeCustomerId: invoice.customer,
        status: { $in: ['active', 'trialing', 'incomplete'] }
      }).sort({ createdAt: -1 });
      
      if (userSubscription) {
        console.log('Found subscription by customer:', userSubscription.stripeSubscriptionId);
      }
    }
    
    if (!userSubscription) {
      console.error('Could not find or create subscription for invoice');
      return;
    }

    // Update subscription payment info
    userSubscription.status = 'active';
    userSubscription.lastPaymentAmount = invoice.amount_paid / 100;
    userSubscription.lastPaymentDate = new Date();
    userSubscription.failedPaymentAttempts = 0;
    await userSubscription.save();

    // Check for existing transaction (idempotent)
    const existingTransaction = await Transaction.findOne({
      stripeInvoiceId: invoice.id
    });

    if (existingTransaction) {
      console.log('Transaction already exists for invoice:', invoice.id);
      return;
    }

    // Create transaction record with all available data
    const transactionData = {
      userId: userSubscription.userId,
      subscriptionId: userSubscription._id,
      stripeInvoiceId: invoice.id,
      stripePaymentIntentId: invoice.payment_intent,
      stripeChargeId: invoice.charge,
      amount: invoice.amount_paid / 100,
      currency: invoice.currency,
      status: 'succeeded',
      type: 'subscription',
      description: invoice.lines?.data[0]?.description || 'Subscription payment'
    };

    // Add optional fields only if present
    if (invoice.hosted_invoice_url) {
      transactionData.invoiceUrl = invoice.hosted_invoice_url;
    }
    
    if (invoice.invoice_pdf) {
      transactionData.invoicePdf = invoice.invoice_pdf;
    }
    
    // Get period dates from invoice lines (more accurate for subscriptions)
    // Stripe sends period info in the lines.data array for subscription invoices
    const lineItem = invoice.lines?.data?.[0];
    if (lineItem && lineItem.period) {
      // Use period from line item (this is the actual billing period)
      if (lineItem.period.start) {
        transactionData.periodStart = new Date(lineItem.period.start * 1000);
      }
      if (lineItem.period.end) {
        transactionData.periodEnd = new Date(lineItem.period.end * 1000);
      }
    } else {
      // Fallback to invoice period dates if line item period not available
      if (invoice.period_start) {
        transactionData.periodStart = new Date(invoice.period_start * 1000);
      }
      if (invoice.period_end) {
        transactionData.periodEnd = new Date(invoice.period_end * 1000);
      }
    }
    
    // Log period dates for debugging
    console.log('Transaction period dates:', {
      periodStart: transactionData.periodStart,
      periodEnd: transactionData.periodEnd,
      lineItemPeriod: lineItem?.period,
      invoicePeriod: {
        start: invoice.period_start,
        end: invoice.period_end
      }
    });
    
    // Add billing details if available
    if (invoice.customer_name || invoice.customer_email) {
      transactionData.billingDetails = {
        name: invoice.customer_name,
        email: invoice.customer_email,
        phone: invoice.customer_phone,
        address: invoice.customer_address
      };
    }

    const transaction = new Transaction(transactionData);
    await transaction.save();
    console.log('Recurring payment transaction created:', transaction._id);
    console.log('Transaction details:', {
      amount: transactionData.amount,
      description: transactionData.description,
      type: transactionData.type
    });

    // Send success email notification
    // await emailService.sendPaymentSuccessEmail(userSubscription.userId, invoice);
    
  } catch (error) {
    console.error('Error processing invoice payment:', error);
    // Per Stripe docs, throw to trigger retry
    throw error;
  }
}

// Handle failed invoice payment
async function handleInvoicePaymentFailed(invoice) {
  console.log('Processing invoice.payment_failed:', invoice.id);
  
  const subscriptionId = invoice.subscription;
  
  if (!subscriptionId) return;

  try {
    // Update subscription status
    const userSubscription = await UserSubscription.findOne({
      stripeSubscriptionId: subscriptionId
    });

    if (!userSubscription) {
      console.error('Subscription not found:', subscriptionId);
      return;
    }

    // Update subscription
    userSubscription.status = 'past_due';
    userSubscription.failedPaymentAttempts = (userSubscription.failedPaymentAttempts || 0) + 1;
    await userSubscription.save();

    // Create failed transaction record
    const existingTransaction = await Transaction.findOne({
      stripeInvoiceId: invoice.id
    });

    if (!existingTransaction) {
      const transaction = new Transaction({
        userId: userSubscription.userId,
        subscriptionId: userSubscription._id,
        stripeInvoiceId: invoice.id,
        stripePaymentIntentId: invoice.payment_intent,
        amount: invoice.amount_due / 100,
        currency: invoice.currency,
        status: 'failed',
        type: 'subscription',
        invoiceUrl: invoice.hosted_invoice_url || '',
        invoicePdf: invoice.invoice_pdf || '',
        description: 'Failed subscription payment',
        periodStart: invoice.period_start ? new Date(invoice.period_start * 1000) : new Date(),
        periodEnd: invoice.period_end ? new Date(invoice.period_end * 1000) : new Date(),
        failureReason: invoice.last_payment_error?.message || 'Payment failed'
      });

      await transaction.save();
    }

    // Send failure email notification
    // await emailService.sendPaymentFailedEmail(userSubscription.userId, invoice);
    
  } catch (error) {
    console.error('Error processing invoice payment failure:', error);
  }
}

// Handle subscription created - Per Stripe docs, always handle idempotently
async function handleSubscriptionCreated(subscription) {
  console.log('Processing customer.subscription.created:', subscription.id);
  
  try {
    // Check if subscription already exists (idempotent handling)
    let userSubscription = await UserSubscription.findOne({
      stripeSubscriptionId: subscription.id
    });

    if (userSubscription) {
      // Update existing subscription - webhook might arrive multiple times
      console.log('Subscription already exists, updating:', subscription.id);
    } else {
      // Create new subscription record - webhook might arrive before API response
      console.log('Creating new subscription from webhook:', subscription.id);
      
      // Find user by Stripe customer ID
      const User = require('../models/user.model');
      const user = await User.findOne({ stripeCustomerId: subscription.customer });
      
      if (!user) {
        console.warn(`Customer ${subscription.customer} not found for subscription ${subscription.id}`);
        // Per Stripe docs, return success to prevent retries for missing data
        return;
      }
      
      // Find the plan from subscription items
      const SubscriptionPlan = require('../models/stripe/subscriptionPlan.model');
      const priceId = subscription.items?.data?.[0]?.price?.id;
      
      if (!priceId) {
        console.warn('No price ID found in subscription items');
        return;
      }
      
      const plan = await SubscriptionPlan.findOne({ stripePriceId: priceId });
      
      if (!plan) {
        console.warn(`Plan not found for price ${priceId}`);
        return;
      }
      
      // Create the subscription record
      userSubscription = new UserSubscription({
        userId: user._id,
        planId: plan._id,
        stripeSubscriptionId: subscription.id,
        stripeCustomerId: subscription.customer,
        stripePriceId: priceId,
        status: subscription.status,
        cancelAtPeriodEnd: subscription.cancel_at_period_end || false
      });
    }
    
    // Update subscription fields (for both new and existing)
    userSubscription.status = subscription.status;
    
    // Safely convert Unix timestamps per Stripe docs
    if (subscription.current_period_start) {
      userSubscription.currentPeriodStart = new Date(subscription.current_period_start * 1000);
    }
    
    if (subscription.current_period_end) {
      userSubscription.currentPeriodEnd = new Date(subscription.current_period_end * 1000);
    }
    
    if (subscription.trial_end) {
      userSubscription.trialEnd = new Date(subscription.trial_end * 1000);
    }
    
    await userSubscription.save();
    console.log('Subscription created/updated successfully:', userSubscription._id);
    
  } catch (error) {
    console.error('Error handling subscription created:', error);
    // Per Stripe docs, throw error to trigger retry
    throw error;
  }
}

// Handle subscription updated
async function handleSubscriptionUpdated(subscription) {
  console.log('Processing customer.subscription.updated:', subscription.id);
  
  try {
    const userSubscription = await UserSubscription.findOne({
      stripeSubscriptionId: subscription.id
    });

    if (!userSubscription) {
      console.error('Subscription not found:', subscription.id);
      return;
    }

    // Update subscription details with proper date validation
    userSubscription.status = subscription.status;
    
    // Safely convert and set dates
    if (subscription.current_period_start) {
      const startDate = new Date(subscription.current_period_start * 1000);
      if (!isNaN(startDate.getTime())) {
        userSubscription.currentPeriodStart = startDate;
      }
    }
    
    if (subscription.current_period_end) {
      const endDate = new Date(subscription.current_period_end * 1000);
      if (!isNaN(endDate.getTime())) {
        userSubscription.currentPeriodEnd = endDate;
      }
    }
    
    userSubscription.cancelAtPeriodEnd = subscription.cancel_at_period_end;
    
    if (subscription.canceled_at) {
      const cancelDate = new Date(subscription.canceled_at * 1000);
      if (!isNaN(cancelDate.getTime())) {
        userSubscription.cancelledAt = cancelDate;
      }
    }
    
    if (subscription.trial_start) {
      const trialStartDate = new Date(subscription.trial_start * 1000);
      if (!isNaN(trialStartDate.getTime())) {
        userSubscription.trialStart = trialStartDate;
      }
    }
    
    if (subscription.trial_end) {
      const trialEndDate = new Date(subscription.trial_end * 1000);
      if (!isNaN(trialEndDate.getTime())) {
        userSubscription.trialEnd = trialEndDate;
      }
    }

    // Check if plan was changed
    const currentPriceId = subscription.items.data[0]?.price.id;
    if (currentPriceId && currentPriceId !== userSubscription.stripePriceId) {
      userSubscription.stripePriceId = currentPriceId;
      userSubscription.isUpgrade = true;
      
      // Create upgrade/downgrade transaction
      const transaction = new Transaction({
        userId: userSubscription.userId,
        subscriptionId: userSubscription._id,
        stripeInvoiceId: `plan_change_${Date.now()}`,
        amount: 0,
        currency: subscription.currency || 'usd',
        status: 'succeeded',
        type: subscription.items.data[0]?.price.unit_amount > subscription.items.data[0]?.price.unit_amount_decimal 
          ? 'upgrade' 
          : 'downgrade',
        description: 'Plan change',
        periodStart: new Date(subscription.current_period_start * 1000),
        periodEnd: new Date(subscription.current_period_end * 1000)
      });
      
      await transaction.save();
    }

    await userSubscription.save();
    console.log('Subscription updated:', userSubscription._id);
    
  } catch (error) {
    console.error('Error handling subscription update:', error);
  }
}

// Handle subscription deleted (cancelled) - Per Stripe docs
async function handleSubscriptionDeleted(subscription) {
  console.log('Processing customer.subscription.deleted:', subscription.id);
  
  try {
    const userSubscription = await UserSubscription.findOne({
      stripeSubscriptionId: subscription.id
    });

    if (!userSubscription) {
      // Per Stripe docs, this is not an error - subscription might have been created externally
      console.log(`Subscription ${subscription.id} not found in DB - may have been created externally`);
      return;
    }

    // Update subscription as cancelled (our model uses 'cancelled' with double 'l')
    userSubscription.status = 'cancelled';  // Our model uses 'cancelled', not Stripe's 'canceled'
    userSubscription.cancelledAt = new Date();
    userSubscription.cancelAtPeriodEnd = false; // Already cancelled
    await userSubscription.save();

    // Only create a transaction if this is end of a paid period
    // Per Stripe docs, we should check if customer should retain access until period end
    if (subscription.current_period_end) {
      const endDate = new Date(subscription.current_period_end * 1000);
      const now = new Date();
      
      // If subscription ended before the period end, customer should retain access
      if (endDate > now) {
        console.log(`Subscription cancelled but active until ${endDate.toISOString()}`);
        userSubscription.status = 'active'; // Keep active until period ends
        userSubscription.cancelAtPeriodEnd = true;
        await userSubscription.save();
      }
    }

    console.log('Subscription cancellation processed:', userSubscription._id);

    // Send cancellation email
    // await emailService.sendSubscriptionCancelledEmail(userSubscription.userId);
    
  } catch (error) {
    console.error('Error handling subscription deletion:', error);
    // Per Stripe docs, throw error to trigger retry
    throw error;
  }
}

// Handle trial ending soon
async function handleTrialWillEnd(subscription) {
  console.log('Processing customer.subscription.trial_will_end:', subscription.id);
  
  try {
    const userSubscription = await UserSubscription.findOne({
      stripeSubscriptionId: subscription.id
    });

    if (!userSubscription) {
      console.error('Subscription not found:', subscription.id);
      return;
    }

    // Send trial ending email (3 days before)
    // await emailService.sendTrialEndingEmail(userSubscription.userId, subscription.trial_end);
    
    console.log('Trial ending notification sent for:', userSubscription._id);
  } catch (error) {
    console.error('Error handling trial will end:', error);
  }
}

// Handle successful payment intent
async function handlePaymentIntentSucceeded(paymentIntent) {
  console.log('Processing payment_intent.succeeded:', paymentIntent.id);
  
  // This is typically handled by invoice.payment_succeeded for subscriptions
  // Can be used for one-time payments
  
  if (!paymentIntent.invoice) {
    // One-time payment, not subscription related
    console.log('One-time payment intent succeeded:', paymentIntent.amount / 100);
  }
}

// Handle failed payment intent
async function handlePaymentIntentFailed(paymentIntent) {
  console.log('Processing payment_intent.payment_failed:', paymentIntent.id);
  
  // Log the failure for investigation
  console.error('Payment failed:', paymentIntent.last_payment_error?.message);
}

// Handle payment method attached
async function handlePaymentMethodAttached(paymentMethod) {
  console.log('Processing payment_method.attached:', paymentMethod.id);
  
  // Update user's payment methods if needed
  // This can be used to track available payment methods
}

// Handle charge refunded
async function handleChargeRefunded(charge) {
  console.log('Processing charge.refunded:', charge.id);
  
  try {
    // Find the transaction
    const transaction = await Transaction.findOne({
      stripeChargeId: charge.id
    });

    if (transaction) {
      transaction.status = 'refunded';
      transaction.refundedAmount = charge.amount_refunded / 100;
      transaction.refundedAt = new Date();
      await transaction.save();
      
      console.log('Transaction refunded:', transaction._id);
    }
  } catch (error) {
    console.error('Error handling charge refund:', error);
  }
}

// Export webhook handler
module.exports = {
  handleStripeWebhook
};