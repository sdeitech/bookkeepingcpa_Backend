module.exports = function (app, validator) {
    require('./userRoutes')(app, validator)
    require('./adminRoutes')(app, validator)
}