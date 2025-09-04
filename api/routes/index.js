module.exports = function (app, validator) {
    require('./userRoutes')(app, validator)
    require('./adminRoutes')(app, validator)
    require('./staffRoutes')(app, validator)
    require('./amazonRoutes')(app, validator)
    require('./stripeRoutes')(app, validator)
    require('./onboardingRoutes')(app, validator)
}