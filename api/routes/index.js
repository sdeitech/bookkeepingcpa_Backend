module.exports = function (app, validator) {
    require('./userRoutes')(app, validator)
    require('./adminRoutes')(app, validator)
    require('./staffRoutes')(app, validator)
    require('./amazonRoutes')(app, validator)
    require('./stripeRoutes')(app, validator)
    require('./onboardingRoutes')(app, validator)
    require('./notificationRoutes')(app, validator)
    
    // Test routes for Firebase notifications (only in development/staging)
    if (process.env.NODE_ENV !== 'production') {
        require('./testNotificationRoutes')(app, validator)
    }
}