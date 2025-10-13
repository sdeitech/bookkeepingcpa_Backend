const resModel = require('../lib/resModel');
const User = require("../models/userModel");
const AssignClient = require("../models/assignClientsModel");
const progressService = require('../services/progress.service');

/**
 * Get Clients Assigned to Current Staff Member with Progress
 * GET /api/staff/my-clients
 * Staff can view their own assigned clients with progress indicators
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
        const clientIds = clients.map(client => client._id);
        
        // Get progress data for all assigned clients
        const progressMap = await progressService.getMultipleClientsProgress(clientIds);
        
        // Combine client data with progress
        const clientsWithProgress = clients.map(client => ({
            ...client.toObject(),
            progress: progressMap[client._id.toString()] || {
                onboarding: { completed: false, step: null },
                subscription: { status: 'none', planName: null, interval: null, expiresAt: null },
                integrations: { amazon: false, shopify: false }
            }
        }));
        
        resModel.success = true;
        resModel.message = "Assigned clients with progress retrieved successfully";
        resModel.data = clientsWithProgress;
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
 * Get Staff Dashboard Stats with Progress Summary
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
        const recentClientIds = recentClients.map(client => client._id);
        
        // Get progress for recent clients
        const progressMap = await progressService.getMultipleClientsProgress(recentClientIds);
        
        // Add progress to recent clients
        const recentClientsWithProgress = recentClients.map(client => ({
            ...client.toObject(),
            progress: progressMap[client._id.toString()] || {
                onboarding: { completed: false, step: null },
                subscription: { status: 'none', planName: null, interval: null, expiresAt: null },
                integrations: { amazon: false, shopify: false }
            }
        }));
        
        // Calculate progress summary for all assigned clients
        const allAssignments = await AssignClient.find({ staffId })
            .populate('clientId', '_id');
        const allClientIds = allAssignments.map(a => a.clientId._id);
        const allProgressMap = await progressService.getMultipleClientsProgress(allClientIds);
        
        // Count progress statuses
        let onboardingComplete = 0;
        let activeSubscriptions = 0;
        let amazonIntegrations = 0;
        let shopifyIntegrations = 0;
        
        Object.values(allProgressMap).forEach(progress => {
            if (progress.onboarding.completed) onboardingComplete++;
            if (progress.subscription.status === 'active' || progress.subscription.status === 'trial') activeSubscriptions++;
            if (progress.integrations.amazon) amazonIntegrations++;
            if (progress.integrations.shopify) shopifyIntegrations++;
        });
        
        const dashboardData = {
            stats: {
                assignedClients: assignedClientsCount,
                onboardingComplete,
                activeSubscriptions,
                amazonIntegrations,
                shopifyIntegrations
            },
            recentClients: recentClientsWithProgress
        };
        
        resModel.success = true;
        resModel.message = "Dashboard data with progress retrieved successfully";
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