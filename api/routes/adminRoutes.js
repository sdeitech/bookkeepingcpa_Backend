/* Controller import starts */
const adminCntrl = require('../controllers/adminController');
/* Controller import ends */

/* Middleware import starts */
const auth = require('../middleware/auth');
/* Middleware import ends */

/* validate model import starts */
const adminModel = require('../validate-models/adminModel');
/* validate model import ends */

module.exports = function (app, validator) {
    // All admin routes require authentication and admin role
    
    // Staff Management Routes (Super Admin only)
    app.post('/api/admin/create-staff', 
        auth, 
        auth.requireAdmin, 
        validator.body(adminModel.createStaff), 
        adminCntrl.createStaff
    );
    
    app.get('/api/admin/get-all-staff', 
        auth, 
        auth.requireAdmin, 
        adminCntrl.getAllStaff
    );
    
    app.put('/api/admin/update-staff/:id', 
        auth, 
        auth.requireAdmin, 
        validator.params(adminModel.commonId),
        validator.body(adminModel.updateStaff), 
        adminCntrl.updateStaff
    );
    
    app.delete('/api/admin/deactivate-staff/:id',
        auth,
        auth.requireAdmin,
        validator.params(adminModel.commonId),
        adminCntrl.deactivateStaff
    );
    
    app.put('/api/admin/reactivate-staff/:id',
        auth,
        auth.requireAdmin,
        validator.params(adminModel.commonId),
        adminCntrl.reactivateStaff
    );
    
    // Admin Dashboard
    app.get('/api/admin/dashboard', 
        auth, 
        auth.requireAdmin, 
        adminCntrl.getAdminDashboard
    );
}