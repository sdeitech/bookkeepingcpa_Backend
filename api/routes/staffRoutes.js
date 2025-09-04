/* Controller import starts */
const staffCntrl = require('../controllers/staffController');
/* Controller import ends */

/* Middleware import starts */
const auth = require('../middleware/auth');
/* Middleware import ends */

module.exports = function (app, validator) {
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
}