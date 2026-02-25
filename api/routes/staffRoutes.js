/* Controller import starts */
const staffCntrl = require('../controllers/staffController');
/* Controller import ends */

/* Middleware import starts */
const auth = require('../middleware/auth');
const bodyParser = require('body-parser');
/* Middleware import ends */

/* validate model import starts */
const staffModel = require('../validate-models/staffModel');
/* validate model import ends */

module.exports = function (app, validator) {
    const jsonParser = bodyParser.json();

    // Complete staff invitation (public endpoint)
    app.post('/api/staff/complete-invite',
        jsonParser,
        validator.body(staffModel.completeInvite),
        staffCntrl.completeInvite
    );

    // All staff routes require authentication and staff role
    
    // Get assigned clients
    app.get('/api/staff/my-clients', 
        auth, 
        auth.requireStaff, 
        staffCntrl.getMyClients
    );
    
    // Staff Dashboard
    app.get('/api/staff/dashboard', 
        auth, 
        auth.requireStaff, 
        staffCntrl.getStaffDashboard
    );

    // Assigned client profile
    app.get('/api/staff/client/:clientId/profile',
        auth,
        auth.requireStaff,
        staffCntrl.getClientProfile
    );
}
