const bcryptService = require('../services/bcrypt.services');
const jwtService = require('../services/jwt.services');
const resModel = require('../lib/resModel');
const User = require("../models/userModel");
const Role = require("../models/roleModel");
const AssignClient = require("../models/assignClientsModel");
const progressService = require('../services/progress.service');
const ShopifyStore = require('../models/shopifyStoreModel');
const AmazonSeller = require('../models/amazonSellerModel');
const QuickBooksCompany = require('../models/quickbooksCompanyModel');
const Notification = require('../models/notification');
const firebaseRealtime = require('../services/firebase.realtime.service');

/**
 * Create Staff Member
 * POST /api/admin/create-staff
 * Only Super Admin (role_id: 1) can create staff
 */
module.exports.createStaff = async (req, res) => {
    try {
        const { first_name, last_name, email, phoneNumber, password } = req.body;
        const adminId = req.userInfo?.id;

        // Check if the requesting user is a super admin
        const adminUser = await User.findById(adminId);
        if (!adminUser || adminUser.role_id !== '1') {
            resModel.success = false;
            resModel.message = "Unauthorized. Only Super Admin can create staff";
            resModel.data = null;
            return res.status(403).json(resModel);
        }

        // Check if staff already exists
        const existingUser = await User.findOne({ email: email.toLowerCase() });
        if (existingUser) {
            resModel.success = false;
            resModel.message = "Staff member with this email already exists";
            resModel.data = null;
            return res.status(400).json(resModel);
        }

        // Hash password
        const passwordHash = await bcryptService.generatePassword(password);

        // Create staff member with role_id: 2
        const staffInfo = {
            first_name,
            last_name,
            email: email.toLowerCase(),
            password: passwordHash,
            phoneNumber,
            role_id: '2', // Staff role
            createdBy: adminId,
            active: true
        };

        const newStaff = new User(staffInfo);
        const savedStaff = await newStaff.save();

        if (savedStaff) {
            // Remove password from response
            savedStaff.password = undefined;

            resModel.success = true;
            resModel.message = "Staff member created successfully";
            resModel.data = savedStaff;
            res.status(200).json(resModel);
        } else {
            resModel.success = false;
            resModel.message = "Error while creating staff member";
            resModel.data = null;
            res.status(400).json(resModel);
        }

    } catch (error) {
        console.error("Error in createStaff:", error);
        resModel.success = false;
        resModel.message = "Internal Server Error";
        resModel.data = null;
        res.status(500).json(resModel);
    }
};

/**
 * Get All Staff Members
 * GET /api/admin/get-all-staff
 * Only Super Admin can view all staff
 */
module.exports.getAllStaff = async (req, res) => {
    try {
        const adminId = req.userInfo?.id;

        // Check if the requesting user is a super admin
        const adminUser = await User.findById(adminId);
        if (!adminUser || adminUser.role_id !== '1') {
            resModel.success = false;
            resModel.message = "Unauthorized. Only Super Admin can view staff";
            resModel.data = null;
            return res.status(403).json(resModel);
        }

        // Get all staff members (role_id: 2)
        const staffMembers = await User.aggregate([
            {
                $match: { role_id: "2" } // Staff role
            },
            {
                $lookup: {
                    from: "assignclients", // MongoDB collection name (lowercase plural)
                    localField: "_id",
                    foreignField: "staffId",
                    as: "assignedClients"
                }
            },
            {
                $addFields: {
                    clientCount: { $size: "$assignedClients" }
                }
            },
            {
                $project: {
                    password: 0,
                    assignedClients: 0
                }
            },
            {
                $sort: { createdAt: -1 }
            }
        ]);


        resModel.success = true;
        resModel.message = "Staff members retrieved successfully";
        resModel.data = staffMembers;
        res.status(200).json(resModel);

    } catch (error) {
        console.error("Error in getAllStaff:", error);
        resModel.success = false;
        resModel.message = "Internal Server Error";
        resModel.data = null;
        res.status(500).json(resModel);
    }
};

/**
 * Update Staff Member
 * PUT /api/admin/update-staff/:id
 * Only Super Admin can update staff
 */
module.exports.updateStaff = async (req, res) => {
    try {
        const { id } = req.params;
        const { first_name, last_name, phoneNumber, active } = req.body;
        const adminId = req.userInfo?.id;

        // Check if the requesting user is a super admin
        const adminUser = await User.findById(adminId);
        if (!adminUser || adminUser.role_id !== '1') {
            resModel.success = false;
            resModel.message = "Unauthorized. Only Super Admin can update staff";
            resModel.data = null;
            return res.status(403).json(resModel);
        }

        // Find staff member
        const staffMember = await User.findById(id);
        if (!staffMember || staffMember.role_id !== '2') {
            resModel.success = false;
            resModel.message = "Staff member not found";
            resModel.data = null;
            return res.status(404).json(resModel);
        }

        // Update staff member
        const updateData = {
            first_name,
            last_name,
            phoneNumber,
            active
        };

        const updatedStaff = await User.findByIdAndUpdate(
            id,
            { $set: updateData },
            { new: true }
        ).select('-password');

        if (updatedStaff) {
            resModel.success = true;
            resModel.message = "Staff member updated successfully";
            resModel.data = updatedStaff;
            res.status(200).json(resModel);
        } else {
            resModel.success = false;
            resModel.message = "Error while updating staff member";
            resModel.data = null;
            res.status(400).json(resModel);
        }

    } catch (error) {
        console.error("Error in updateStaff:", error);
        resModel.success = false;
        resModel.message = "Internal Server Error";
        resModel.data = null;
        res.status(500).json(resModel);
    }
};

/**
 * Deactivate Staff Member
 * DELETE /api/admin/deactivate-staff/:id
 * Only Super Admin can deactivate staff
 */
module.exports.deactivateStaff = async (req, res) => {
    try {
        const { id } = req.params;
        const adminId = req.userInfo?.id;

        // Check if the requesting user is a super admin
        const adminUser = await User.findById(adminId);
        if (!adminUser || adminUser.role_id !== '1') {
            resModel.success = false;
            resModel.message = "Unauthorized. Only Super Admin can deactivate staff";
            resModel.data = null;
            return res.status(403).json(resModel);
        }

        // Find and deactivate staff member
        const staffMember = await User.findById(id);
        if (!staffMember || staffMember.role_id !== '2') {
            resModel.success = false;
            resModel.message = "Staff member not found";
            resModel.data = null;
            return res.status(404).json(resModel);
        }

        // Soft delete - just set active to false
        staffMember.active = false;
        await staffMember.save();

        resModel.success = true;
        resModel.message = "Staff member deactivated successfully";
        resModel.data = { id: staffMember._id, active: staffMember.active };
        res.status(200).json(resModel);

    } catch (error) {
        console.error("Error in deactivateStaff:", error);
        resModel.success = false;
        resModel.message = "Internal Server Error";
        resModel.data = null;
        res.status(500).json(resModel);
    }
};

/**
 * Reactivate Staff Member
 * PUT /api/admin/reactivate-staff/:id
 * Only Super Admin can reactivate staff
 */
module.exports.reactivateStaff = async (req, res) => {
    try {
        const { id } = req.params;
        const adminId = req.userInfo?.id;

        // Check if the requesting user is a super admin
        const adminUser = await User.findById(adminId);
        if (!adminUser || adminUser.role_id !== '1') {
            resModel.success = false;
            resModel.message = "Unauthorized. Only Super Admin can reactivate staff";
            resModel.data = null;
            return res.status(403).json(resModel);
        }

        // Find and reactivate staff member
        const staffMember = await User.findById(id);
        if (!staffMember || staffMember.role_id !== '2') {
            resModel.success = false;
            resModel.message = "Staff member not found";
            resModel.data = null;
            return res.status(404).json(resModel);
        }

        // Reactivate - set active to true
        staffMember.active = true;
        await staffMember.save();

        resModel.success = true;
        resModel.message = "Staff member reactivated successfully";
        resModel.data = { id: staffMember._id, active: staffMember.active };
        res.status(200).json(resModel);

    } catch (error) {
        console.error("Error in reactivateStaff:", error);
        resModel.success = false;
        resModel.message = "Internal Server Error";
        resModel.data = null;
        res.status(500).json(resModel);
    }
};

/**
 * Get Client Profile with Integration Details
 * GET /api/admin/client/:clientId/profile
 * Admin can view any client's complete profile and integration status
 */
module.exports.getClientProfile = async (req, res) => {
    try {
        const { clientId } = req.params;
        const adminId = req.userInfo?.id;

        // Verify admin role
        const adminUser = await User.findById(adminId);
        if (!adminUser || adminUser.role_id !== '1') {
            resModel.success = false;
            resModel.message = "Admin access required";
            resModel.data = null;
            return res.status(403).json(resModel);
        }

        // Get client details
        const client = await User.findById(clientId)
            .select('-password -resetPasswordToken -resetPasswordExpires');

        if (!client) {
            resModel.success = false;
            resModel.message = 'Client not found';
            resModel.data = null;
            return res.status(404).json(resModel);
        }

        // Check integration connections in parallel
        const [shopify, amazon, quickbooks] = await Promise.all([
            ShopifyStore.findOne({ userId: clientId, isActive: true })
                .select('shopName shopDomain shopEmail shopPlan shopCountry shopCurrency lastSyncedAt createdAt'),
            AmazonSeller.findOne({ userId: clientId, isActive: true })
                .select('sellerName sellerId sellerEmail marketplaceIds lastSyncedAt createdAt'),
            QuickBooksCompany.findOne({ userId: clientId, isActive: true })
                .select('companyName companyId companyEmail lastSyncedAt createdAt')
        ]);

        // Build response
        const profileData = {
            client: {
                id: client._id,
                email: client.email,
                name: `${client.first_name || ''} ${client.last_name || ''}`.trim(),
                firstName: client.first_name,
                lastName: client.last_name,
                businessName: client.businessName,
                phone: client.phoneNumber,
                active: client.active,
                createdAt: client.createdAt,
                updatedAt: client.updatedAt
            },
            integrations: {
                shopify: shopify ? {
                    connected: true,
                    shopName: shopify.shopName,
                    shopDomain: shopify.shopDomain,
                    shopEmail: shopify.shopEmail,
                    shopPlan: shopify.shopPlan,
                    shopCountry: shopify.shopCountry,
                    shopCurrency: shopify.shopCurrency,
                    lastSync: shopify.lastSyncedAt,
                    connectedSince: shopify.createdAt
                } : { connected: false },
                amazon: amazon ? {
                    connected: true,
                    sellerName: amazon.sellerName,
                    sellerId: amazon.sellerId,
                    sellerEmail: amazon.sellerEmail,
                    marketplaceIds: amazon.marketplaceIds,
                    lastSync: amazon.lastSyncedAt,
                    connectedSince: amazon.createdAt
                } : { connected: false },
                quickbooks: quickbooks ? {
                    connected: true,
                    companyName: quickbooks.companyName,
                    companyId: quickbooks.companyId,
                    companyEmail: quickbooks.companyEmail,
                    lastSync: quickbooks.lastSyncedAt,
                    connectedSince: quickbooks.createdAt
                } : { connected: false }
            }
        };

        resModel.success = true;
        resModel.message = 'Client profile retrieved successfully';
        resModel.data = profileData;
        return res.status(200).json(resModel);
    } catch (error) {
        console.error('Get client profile error:', error);
        resModel.success = false;
        resModel.message = error.message || 'Failed to get client profile';
        resModel.data = null;
        return res.status(500).json(resModel);
    }
};

/**
 * Get All Clients for Admin Selection
 * GET /api/admin/clients-list
 * Returns simplified client list for selection dropdown
 */
module.exports.getAllClients = async (req, res) => {
    try {
        const adminId = req.userInfo?.id;

        // Verify admin role
        const adminUser = await User.findById(adminId);
        if (!adminUser || adminUser.role_id !== '1') {
            resModel.success = false;
            resModel.message = "Admin access required";
            resModel.data = null;
            return res.status(403).json(resModel);
        }

        // Get all clients with role_id = '3'
        const clients = await User.find({ role_id: '3' })
            .select('_id email first_name last_name businessName active createdAt')
            .sort({ createdAt: -1 });

        // Format response for easier frontend consumption
        const formattedClients = clients.map(client => ({
            id: client._id,
            email: client.email,
            first_name: client.first_name,
            last_name: client.last_name,
            // name: `${client.first_name || ''} ${client.last_name || ''}`.trim(),
            businessName: client.businessName,
            active: client.active,
            createdAt: client.createdAt
        }));

        resModel.success = true;
        resModel.message = 'Clients retrieved successfully';
        resModel.data = formattedClients;
        return res.status(200).json(resModel);
    } catch (error) {
        console.error('Get all clients error:', error);
        resModel.success = false;
        resModel.message = error.message || 'Failed to get clients';
        resModel.data = null;
        return res.status(500).json(resModel);
    }
};

/**
 * Get Dashboard Stats for Admin
 * GET /api/admin/dashboard
 */
module.exports.getAdminDashboard = async (req, res) => {
    try {
        const adminId = req.userInfo?.id;

        // Check if the requesting user is a super admin
        const adminUser = await User.findById(adminId);
        if (!adminUser || adminUser.role_id !== '1') {
            resModel.success = false;
            resModel.message = "Unauthorized. Only Super Admin can access admin dashboard";
            resModel.data = null;
            return res.status(403).json(resModel);
        }

        // Get stats
        const totalStaff = await User.countDocuments({ role_id: '2' });
        const activeStaff = await User.countDocuments({ role_id: '2', active: true });
        const totalClients = await User.countDocuments({ role_id: '3' });
        const activeClients = await User.countDocuments({ role_id: '3', active: true });

        // Get recent staff members
        const recentStaff = await User.find({ role_id: '2' })
            .select('first_name last_name email active createdAt')
            .sort({ createdAt: -1 })
            .limit(5);

        // Get recent clients
        const recentClients = await User.find({ role_id: '3' })
            .select('first_name last_name email active createdAt')
            .sort({ createdAt: -1 })
            .limit(5);

        const dashboardData = {
            stats: {
                totalStaff,
                activeStaff,
                totalClients,
                activeClients
            },
            recentStaff,
            recentClients
        };

        resModel.success = true;
        resModel.message = "Dashboard data retrieved successfully";
        resModel.data = dashboardData;
        res.status(200).json(resModel);

    } catch (error) {
        console.error("Error in getAdminDashboard:", error);
        resModel.success = false;
        resModel.message = "Internal Server Error";
        resModel.data = null;
        res.status(500).json(resModel);
    }
};

/**
 * Assign Client to Staff
 * POST /api/admin/assign-client
 * Only Super Admin can assign clients to staff
 */
module.exports.assignClient = async (req, res) => {
    try {
        const { clientId, staffId } = req.body;
        const adminId = req.userInfo?.id;

        // Check if the requesting user is a super admin
        const adminUser = await User.findById(adminId);
        if (!adminUser || adminUser.role_id !== '1') {
            resModel.success = false;
            resModel.message = "Unauthorized. Only Super Admin can assign clients";
            resModel.data = null;
            return res.status(403).json(resModel);
        }

        // Validate staff exists and is a staff member
        const staffMember = await User.findById(staffId);
        if (!staffMember || staffMember.role_id !== '2') {
            resModel.success = false;
            resModel.message = "Invalid staff member";
            resModel.data = null;
            return res.status(400).json(resModel);
        }

        // Validate client exists and is a client
        const client = await User.findById(clientId);
        if (!client || client.role_id !== '3') {
            resModel.success = false;
            resModel.message = "Invalid client";
            resModel.data = null;
            return res.status(400).json(resModel);
        }

        // Check if assignment already exists
        const existingAssignment = await AssignClient.findOne({ clientId, staffId });
        if (existingAssignment) {
            resModel.success = false;
            resModel.message = "Client is already assigned to this staff member";
            resModel.data = null;
            return res.status(400).json(resModel);
        }

        // Create new assignment
        const newAssignment = new AssignClient({
            clientId,
            staffId
        });

        const savedAssignment = await newAssignment.save();

        // Populate the response with staff and client details
        const populatedAssignment = await AssignClient.findById(savedAssignment._id)
            .populate('staffId', 'first_name last_name email')
            .populate('clientId', 'first_name last_name email');

        // ─────────────────────────────────────────────
        // NOTIFICATION: Notify Staff Member
        // ─────────────────────────────────────────────
        const staffNotification = new Notification({
            type: 'assignment',
            title: 'New Client Assigned 👤',
            message: `You have been assigned a new client: ${client.first_name} ${client.last_name}. Please reach out to get started.`,
            recipientId: staffId,
            senderId: adminId,
            senderName: `${adminUser.first_name} ${adminUser.last_name}`,
            senderRole: 'admin',
            priority: 'high',
            category: 'alert',
            actionUrl: `/clients/${clientId}`,
            actionType: 'navigate',
            actionLabel: 'View Client',
            metadata: {
                assignmentId: savedAssignment._id.toString(),
                clientId: clientId.toString(),
                clientName: `${client.first_name} ${client.last_name}`,
                clientEmail: client.email,
                assignedBy: adminId.toString(),
                assignedByName: `${adminUser.first_name} ${adminUser.last_name}`,
            },
            relatedEntities: {
                assignmentId: savedAssignment._id
            },
            isRead: false,
            status: 'sent',
            deliveryStatus: {
                inApp: {
                    sent: true,
                    sentAt: new Date()
                }
            },
            tags: ['assignment', 'client', 'staff']
        });

        await staffNotification.save();

        await firebaseRealtime.emitNotificationSignal(
            staffId,
            staffNotification._id,
            'new'
        );

        // ─────────────────────────────────────────────
        // NOTIFICATION: Notify Client
        // ─────────────────────────────────────────────
        const clientNotification = new Notification({
            type: 'assignment',
            title: 'You Have Been Assigned a Staff Member 🙌',
            message: `${staffMember.first_name} ${staffMember.last_name} has been assigned to assist you. Feel free to reach out to them anytime.`,
            recipientId: clientId,
            senderId: adminId,
            senderName: `${adminUser.first_name} ${adminUser.last_name}`,
            senderRole: 'admin',
            priority: 'low',
            category: 'general',
            actionUrl: `/support`,
            actionType: 'navigate',
            actionLabel: 'Contact Support',
            metadata: {
                assignmentId: savedAssignment._id.toString(),
                staffId: staffId.toString(),
                staffName: `${staffMember.first_name} ${staffMember.last_name}`,
                staffEmail: staffMember.email,
                assignedBy: adminId.toString(),
                assignedByName: `${adminUser.first_name} ${adminUser.last_name}`,
            },
            relatedEntities: {
                assignmentId: savedAssignment._id
            },
            isRead: false,
            status: 'sent',
            deliveryStatus: {
                inApp: {
                    sent: true,
                    sentAt: new Date()
                }
            },
            tags: ['assignment', 'staff', 'client']
        });

        await clientNotification.save();

        await firebaseRealtime.emitNotificationSignal(
            clientId,
            clientNotification._id,
            'new'
        );

        resModel.success = true;
        resModel.message = "Client assigned to staff successfully";
        resModel.data = populatedAssignment;
        res.status(200).json(resModel);

    } catch (error) {
        console.error("Error in assignClient:", error);
        resModel.success = false;
        resModel.message = "Internal Server Error";
        resModel.data = null;
        res.status(500).json(resModel);
    }
};

/**
 * Remove Client Assignment
 * DELETE /api/admin/unassign-client
 * Only Super Admin can remove client assignments
 */
module.exports.unassignClient = async (req, res) => {
    try {
        const { clientId, staffId } = req.body;
        const adminId = req.userInfo?.id;

        // Check if the requesting user is a super admin
        const adminUser = await User.findById(adminId);
        if (!adminUser || adminUser.role_id !== '1') {
            resModel.success = false;
            resModel.message = "Unauthorized. Only Super Admin can unassign clients";
            resModel.data = null;
            return res.status(403).json(resModel);
        }

        // Find and delete the assignment
        const assignment = await AssignClient.findOneAndDelete({ clientId, staffId });

        if (!assignment) {
            resModel.success = false;
            resModel.message = "Assignment not found";
            resModel.data = null;
            return res.status(404).json(resModel);
        }

        resModel.success = true;
        resModel.message = "Client unassigned from staff successfully";
        resModel.data = { clientId, staffId };
        res.status(200).json(resModel);

    } catch (error) {
        console.error("Error in unassignClient:", error);
        resModel.success = false;
        resModel.message = "Internal Server Error";
        resModel.data = null;
        res.status(500).json(resModel);
    }
};

/**
 * Get All Client Assignments
 * GET /api/admin/get-assignments
 * Only Super Admin can view all assignments
 */
module.exports.getAllAssignments = async (req, res) => {
    try {
        const adminId = req.userInfo?.id;

        // Check if the requesting user is a super admin
        const adminUser = await User.findById(adminId);
        if (!adminUser || adminUser.role_id !== '1') {
            resModel.success = false;
            resModel.message = "Unauthorized. Only Super Admin can view assignments";
            resModel.data = null;
            return res.status(403).json(resModel);
        }

        // Get all assignments with populated data
        const assignments = await AssignClient.find()
            .populate('staffId', 'first_name last_name email active')
            .populate('clientId', 'first_name last_name email active')
            .sort({ createdAt: -1 });

        resModel.success = true;
        resModel.message = "Assignments retrieved successfully";
        resModel.data = assignments;
        res.status(200).json(resModel);

    } catch (error) {
        console.error("Error in getAllAssignments:", error);
        resModel.success = false;
        resModel.message = "Internal Server Error";
        resModel.data = null;
        res.status(500).json(resModel);
    }
};

/**
 * Get Clients Assigned to a Staff Member
 * GET /api/admin/staff-clients/:staffId
 * Super Admin can view any staff's clients
 */
module.exports.getStaffClients = async (req, res) => {
    try {
        const { staffId } = req.params;
        const adminId = req.userInfo?.id;

        // Check if the requesting user is a super admin
        const adminUser = await User.findById(adminId);
        if (!adminUser || adminUser.role_id !== '1') {
            resModel.success = false;
            resModel.message = "Unauthorized. Only Super Admin can view staff clients";
            resModel.data = null;
            return res.status(403).json(resModel);
        }

        // Get all clients assigned to this staff member
        const assignments = await AssignClient.find({ staffId })
            .populate('clientId', 'first_name last_name email phoneNumber active createdAt')
            .sort({ createdAt: -1 });

        const clients = assignments.map(assignment => assignment.clientId);

        resModel.success = true;
        resModel.message = "Staff clients retrieved successfully";
        resModel.data = clients;
        res.status(200).json(resModel);

    } catch (error) {
        console.error("Error in getStaffClients:", error);
        resModel.success = false;
        resModel.message = "Internal Server Error";
        resModel.data = null;
        res.status(500).json(resModel);
    }
};

/**
 * Get All Clients with Assignment Status and Progress
 * GET /api/admin/clients-with-assignments
 * Shows all clients and their assignment status with progress indicators
 */
module.exports.getClientsWithAssignments = async (req, res) => {
    try {
        const adminId = req.userInfo?.id;

        // Check if the requesting user is a super admin
        const adminUser = await User.findById(adminId);
        if (!adminUser || adminUser.role_id !== '1') {
            resModel.success = false;
            resModel.message = "Unauthorized. Only Super Admin can view this data";
            resModel.data = null;
            return res.status(403).json(resModel);
        }

        // Get all clients
        const clients = await User.find({ role_id: '3' })
            .select('first_name last_name email phoneNumber active createdAt')
            .sort({ createdAt: -1 });

        // Get all assignments
        const assignments = await AssignClient.find()
            .populate('staffId', 'first_name last_name email');

        // Create a map of client assignments
        const assignmentMap = {};
        assignments.forEach(assignment => {
            assignmentMap[assignment.clientId.toString()] = {
                staffId: assignment.staffId._id,
                staffName: `${assignment.staffId.first_name} ${assignment.staffId.last_name}`,
                staffEmail: assignment.staffId.email
            };
        });

        // Get progress data for all clients
        const clientIds = clients.map(client => client._id);
        const progressMap = await progressService.getMultipleClientsProgress(clientIds);

        // Combine clients with their assignment info and progress
        const clientsWithAssignments = clients.map(client => ({
            ...client.toObject(),
            assignedStaff: assignmentMap[client._id.toString()] || null,
            progress: progressMap[client._id.toString()] || {
                onboarding: { completed: false, step: null },
                subscription: { status: 'none', planName: null, interval: null, expiresAt: null },
                integrations: { amazon: false, shopify: false }
            }
        }));

        resModel.success = true;
        resModel.message = "Clients with assignments and progress retrieved successfully";
        resModel.data = clientsWithAssignments;
        res.status(200).json(resModel);

    } catch (error) {
        console.error("Error in getClientsWithAssignments:", error);
        resModel.success = false;
        resModel.message = "Internal Server Error";
        resModel.data = null;
        res.status(500).json(resModel);
    }
};