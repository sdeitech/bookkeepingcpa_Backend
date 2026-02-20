/* Controller import starts */
const userCntrl = require('../controllers/userController');
/* Controller import ends */

/* validate model import starts */
const userModel = require('../validate-models/userModel');
/* validate model import ends */

/* Services import */
const { uploadProfilePicture } = require('../services/multer.services');

const auth = require('../middleware/auth');
const bodyParser = require('body-parser');

module.exports = function (app, validator) {
   // Create JSON parser middleware
   const jsonParser = bodyParser.json();
   
   // Authentication routes - Clean auth system
   app.post('/api/auth/signup', jsonParser, validator.body(userModel.signupUser), userCntrl.signupUser);
   app.post('/api/auth/signin', jsonParser, validator.body(userModel.signinUser), userCntrl.signInUser);
   app.post('/api/auth/google', jsonParser, userCntrl.googleWithLogin);
   
   // Public User routes
   app.get('/api/users', userCntrl.getAllUser);  // Get all users
   app.get('/api/users/:id', userCntrl.getUserDetails);  // Get specific user by ID
   
   // Protected Profile routes - Requires authentication
   app.get('/api/user/profile', auth, userCntrl.getCurrentUser);  // Get current user profile
   app.put('/api/user/profile', jsonParser, auth, userCntrl.updateUserProfile);  // Update user profile
   app.post('/api/user/profile/upload-picture', auth, uploadProfilePicture, userCntrl.uploadProfilePicture);  // Upload profile picture
   app.patch("/api/user/profile/update-password", jsonParser, auth, validator.body(userModel.updatePassword), userCntrl.updatePassword);  // Update user password
}