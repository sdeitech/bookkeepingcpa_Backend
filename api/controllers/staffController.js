const resModel = require('../lib/resModel');
const User = require("../models/userModel");
const AssignClient = require("../models/assignClientsModel");

/**
 * Get Clients Assigned to Current Staff Member
 * GET /api/staff/my-clients
 * Staff can view their own assigned clients
 */
module.exports.getMyClients = async (req, res) => {
    try {
        const staffId = req.userInfo?.id;
        
        // Verify the user is a staff member
        const staffMember = await User.findById(staffId);
        if (!staffMember || staffMember.role_id !== '2') {
            resModel.success = false;
            resModel.message = "Unauthorized. Only staff can access this endpoint";
            resModel.data = null;
            return res.status(403).json(resModel);
        }
        
        // Get all clients assigned to this staff member
        const assignments = await AssignClient.find({ staffId })
            .populate('clientId', 'first_name last_name email phoneNumber active createdAt')
            .sort({ createdAt: -1 });
        
        const clients = assignments.map(assignment => assignment.clientId);
        
        resModel.success = true;
        resModel.message = "Assigned clients retrieved successfully";
        resModel.data = clients;
        res.status(200).json(resModel);
        
    } catch (error) {
        console.error("Error in getMyClients:", error);
        resModel.success = false;
        resModel.message = "Internal Server Error";
        resModel.data = null;
        res.status(500).json(resModel);
    }
};

/**
 * Get Staff Dashboard Stats
 * GET /api/staff/dashboard
 */
module.exports.getStaffDashboard = async (req, res) => {
    try {
        const staffId = req.userInfo?.id;
        
        // Verify the user is a staff member
        const staffMember = await User.findById(staffId);
        if (!staffMember || staffMember.role_id !== '2') {
            resModel.success = false;
            resModel.message = "Unauthorized. Only staff can access this endpoint";
            resModel.data = null;
            return res.status(403).json(resModel);
        }
        
        // Get assigned clients count
        const assignedClientsCount = await AssignClient.countDocuments({ staffId });
        
        // Get assigned clients details
        const assignments = await AssignClient.find({ staffId })
            .populate('clientId', 'first_name last_name email phoneNumber active')
            .limit(5)
            .sort({ createdAt: -1 });
        
        const recentClients = assignments.map(a => a.clientId);
        
        const dashboardData = {
            stats: {
                assignedClients: assignedClientsCount,
                pendingTasks: 0, // Placeholder for future implementation
                completedToday: 0 // Placeholder for future implementation
            },
            recentClients
        };
        
        resModel.success = true;
        resModel.message = "Dashboard data retrieved successfully";
        resModel.data = dashboardData;
        res.status(200).json(resModel);
        
    } catch (error) {
        console.error("Error in getStaffDashboard:", error);
        resModel.success = false;
        resModel.message = "Internal Server Error";
        resModel.data = null;
        res.status(500).json(resModel);
    }
};