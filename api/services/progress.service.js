const Onboarding = require('../models/onboarding.model');
const UserSubscription = require('../models/stripe/userSubscription.model');
const AmazonSeller = require('../models/amazonSellerModel');
const ShopifyStore = require('../models/shopifyStoreModel');

/**
 * Get progress data for a single client
 * @param {String} clientId - The client's user ID
 * @returns {Object} Progress data including onboarding, subscription, and integration status
 */
const getClientProgress = async (clientId) => {
    try {
        // Fetch all progress data in parallel
        const [onboarding, subscription, amazonSeller, shopifyStore] = await Promise.all([
            Onboarding.findOne({ userId: clientId }),
            UserSubscription.findOne({ userId: clientId })
                .populate('subscriptionPlanId', 'name interval')
                .sort({ createdAt: -1 }), // Get most recent subscription
            AmazonSeller.findOne({ userId: clientId }),
            ShopifyStore.findOne({ userId: clientId })
        ]);

        // Determine onboarding status
        const isOnboardingComplete = onboarding ? onboarding.completed : false;

        // Determine subscription status
        let subscriptionStatus = 'none';
        if (subscription) {
            if (subscription.status === 'active') {
                subscriptionStatus = 'active';
            } else if (subscription.status === 'trialing') {
                subscriptionStatus = 'trial';
            } else if (subscription.status === 'canceled' || subscription.status === 'expired') {
                // Check if expired based on currentPeriodEnd
                const now = new Date();
                if (subscription.currentPeriodEnd && new Date(subscription.currentPeriodEnd) < now) {
                    subscriptionStatus = 'expired';
                } else {
                    subscriptionStatus = 'expired';
                }
            }
        }

        // Check integration status
        const hasAmazonIntegration = amazonSeller && amazonSeller.isActive ? true : false;
        const hasShopifyIntegration = shopifyStore && shopifyStore.isActive ? true : false;

        return {
            onboarding: {
                completed: isOnboardingComplete,
                step: onboarding ? onboarding.currentStep : null
            },
            subscription: {
                status: subscriptionStatus,
                planName: subscription?.subscriptionPlanId?.name || null,
                interval: subscription?.subscriptionPlanId?.interval || null,
                expiresAt: subscription?.currentPeriodEnd || null
            },
            integrations: {
                amazon: hasAmazonIntegration,
                shopify: hasShopifyIntegration
            }
        };
    } catch (error) {
        console.error('Error getting client progress:', error);
        // Return default progress data on error
        return {
            onboarding: { completed: false, step: null },
            subscription: { status: 'none', planName: null, interval: null, expiresAt: null },
            integrations: { amazon: false, shopify: false }
        };
    }
};

/**
 * Get progress data for multiple clients
 * @param {Array} clientIds - Array of client user IDs
 * @returns {Object} Map of clientId to progress data
 */
const getMultipleClientsProgress = async (clientIds) => {
    try {
        // Fetch all data in bulk for efficiency
        const [onboardings, subscriptions, amazonSellers, shopifyStores] = await Promise.all([
            Onboarding.find({ userId: { $in: clientIds } }),
            UserSubscription.find({ userId: { $in: clientIds } })
                .populate('subscriptionPlanId', 'name interval')
                .sort({ userId: 1, createdAt: -1 }), // Sort by user and date to get most recent per user
            AmazonSeller.find({ userId: { $in: clientIds } }),
            ShopifyStore.find({ userId: { $in: clientIds } })
        ]);

        // Create maps for quick lookup
        const onboardingMap = {};
        onboardings.forEach(ob => {
            onboardingMap[ob.userId.toString()] = ob;
        });

        // Get most recent subscription per user
        const subscriptionMap = {};
        subscriptions.forEach(sub => {
            const userId = sub.userId.toString();
            if (!subscriptionMap[userId] || 
                sub.createdAt > subscriptionMap[userId].createdAt) {
                subscriptionMap[userId] = sub;
            }
        });

        const amazonMap = {};
        amazonSellers.forEach(seller => {
            amazonMap[seller.userId.toString()] = seller;
        });

        const shopifyMap = {};
        shopifyStores.forEach(store => {
            shopifyMap[store.userId.toString()] = store;
        });

        // Build progress data for each client
        const progressMap = {};
        for (const clientId of clientIds) {
            const clientIdStr = clientId.toString();
            const onboarding = onboardingMap[clientIdStr];
            const subscription = subscriptionMap[clientIdStr];
            const amazonSeller = amazonMap[clientIdStr];
            const shopifyStore = shopifyMap[clientIdStr];

            // Determine subscription status
            let subscriptionStatus = 'none';
            if (subscription) {
                if (subscription.status === 'active') {
                    subscriptionStatus = 'active';
                } else if (subscription.status === 'trialing') {
                    subscriptionStatus = 'trial';
                } else {
                    const now = new Date();
                    if (subscription.currentPeriodEnd && new Date(subscription.currentPeriodEnd) < now) {
                        subscriptionStatus = 'expired';
                    } else {
                        subscriptionStatus = 'expired';
                    }
                }
            }

            progressMap[clientIdStr] = {
                onboarding: {
                    completed: onboarding ? onboarding.completed : false,
                    step: onboarding ? onboarding.currentStep : null
                },
                subscription: {
                    status: subscriptionStatus,
                    planName: subscription?.subscriptionPlanId?.name || null,
                    interval: subscription?.subscriptionPlanId?.interval || null,
                    expiresAt: subscription?.currentPeriodEnd || null
                },
                integrations: {
                    amazon: amazonSeller && amazonSeller.isActive ? true : false,
                    shopify: shopifyStore && shopifyStore.isActive ? true : false
                }
            };
        }

        return progressMap;
    } catch (error) {
        console.error('Error getting multiple clients progress:', error);
        // Return empty map on error
        return {};
    }
};

module.exports = {
    getClientProgress,
    getMultipleClientsProgress
};