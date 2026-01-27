module.exports = function (app, validator) {
    require('./userRoutes')(app, validator)
    require('./adminRoutes')(app, validator)
    require('./staffRoutes')(app, validator)
    require('./amazonRoutes')(app, validator)
    require('./shopifyRoutes')(app, validator)  // Shopify integration
    require('./quickbooksRoutes')(app, validator)  // QuickBooks integration
    require('./stripeRoutes')(app, validator)
    require('./onboardingRoutes')(app, validator)
    require('./questionnaireRoutes')(app, validator)  // Questionnaire submission routes
    require('./zapierRoutes')(app, validator)  // Zapier/Ignition integration routes
    require('./notificationRoutes')(app, validator)
    require('./documentRoutes')(app, validator)  // Document upload/management routes
    
    // Test routes for Firebase notifications (only in development/staging)
    if (process.env.NODE_ENV !== 'production') {
        require('./testNotificationRoutes')(app, validator)
    }
}