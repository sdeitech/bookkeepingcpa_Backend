/* Controller import starts */
const userCntrl = require('../controllers/userController');
/* Controller import ends */

/* validate model import starts */
const userModel = require('../validate-models/userModel');
/* validate model import ends */

const auth = require('../middleware/auth');

module.exports = function (app, validator) {
   // Authentication routes - Clean auth system
   app.post('/api/auth/signup', validator.body(userModel.signupUser), userCntrl.signupUser);
   app.post('/api/auth/signin', validator.body(userModel.signinUser), userCntrl.signInUser);
   app.post('/api/auth/google', userCntrl.googleWithLogin);
   
   // User routes
   app.get('/api/users', userCntrl.getAllUser);  // Get all users
   app.get('/api/users/:id', userCntrl.getUserDetails);  // Get specific user by ID
}