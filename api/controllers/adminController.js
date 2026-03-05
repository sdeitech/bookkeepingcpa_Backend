const bcryptService = require('../services/bcrypt.services');
const jwtService = require('../services/jwt.services');
const resModel = require('../lib/resModel');
const crypto = require('crypto');
const User = require("../models/userModel");
const Role = require("../models/roleModel");
const progressService = require('../services/progress.service');
const ShopifyStore = require('../models/shopifyStoreModel');
const AmazonSeller = require('../models/amazonSellerModel');
const QuickBooksCompany = require('../models/quickbooksCompanyModel');
const Notification = require('../models/notification');
const firebaseRealtime = require('../services/firebase.realtime.service');
const emailService = require('../services/email.service');

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
            active: true,
            inviteStatus: 'accepted'
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
 * Invite Staff Member
 * POST /api/admin/invite-staff
 * Only Super Admin (role_id: 1) can invite staff
 */
module.exports.inviteStaff = async (req, res) => {
    try {
        const { first_name, last_name, email, phoneNumber } = req.body;
        const adminId = req.userInfo?.id;

        const adminUser = await User.findById(adminId);
        if (!adminUser || adminUser.role_id !== '1') {
            resModel.success = false;
            resModel.message = "Unauthorized. Only Super Admin can invite staff";
            resModel.data = null;
            return res.status(403).json(resModel);
        }

        const normalizedEmail = email.toLowerCase();
        const existingUser = await User.findOne({ email: normalizedEmail });
        const inviteToken = crypto.randomBytes(32).toString('hex');
        const inviteTokenExpiry = new Date(Date.now() + (7 * 24 * 60 * 60 * 1000)); // 7 days

        let staffUser;
        if (!existingUser) {
            staffUser = await new User({
                first_name,
                last_name,
                email: normalizedEmail,
                phoneNumber,
                role_id: '2',
                createdBy: adminId,
                active: false,
                inviteToken,
                inviteTokenExpiry,
                inviteStatus: 'pending'
            }).save();
        } else {
            if (existingUser.role_id !== '2') {
                resModel.success = false;
                resModel.message = "A non-staff user with this email already exists";
                resModel.data = null;
                return res.status(400).json(resModel);
            }

            // Prevent duplicate invite sends while a previous invite is still valid.
            const hasLivePendingInvite =
                existingUser.inviteToken &&
                existingUser.inviteTokenExpiry &&
                existingUser.inviteTokenExpiry > new Date() &&
                (existingUser.inviteStatus === 'pending' || !existingUser.inviteStatus);

            if (hasLivePendingInvite) {
                resModel.success = false;
                resModel.message = "Invite already sent for this staff member";
                resModel.data = {
                    id: existingUser._id,
                    email: existingUser.email,
                    inviteExpiresAt: existingUser.inviteTokenExpiry
                };
                return res.status(409).json(resModel);
            }

            existingUser.first_name = first_name || existingUser.first_name;
            existingUser.last_name = last_name || existingUser.last_name;
            existingUser.phoneNumber = phoneNumber || existingUser.phoneNumber;
            existingUser.active = false;
            existingUser.createdBy = existingUser.createdBy || adminId;
            existingUser.inviteToken = inviteToken;
            existingUser.inviteTokenExpiry = inviteTokenExpiry;
            existingUser.inviteStatus = 'pending';
            await existingUser.save();
            staffUser = existingUser;
        }

        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:8082';
        const inviteUrl = `${frontendUrl}/staff/complete-invite?token=${inviteToken}`;

        const emailResult = await emailService.sendEmail({
            to: staffUser.email,
            subject: `${process.env.COMPANY_NAME || 'Bookkeeping CPA'} Staff Invitation`,
            html: `
                <p>Hello ${staffUser.first_name || 'there'},</p>
                <p>You have been invited to join as a staff member.</p>
                <p>Complete your invitation here:</p>
                <p><a href="${inviteUrl}">${inviteUrl}</a></p>
                <p>This invitation expires in 7 days.</p>
            `,
            text: `Hello ${staffUser.first_name || 'there'},\n\nYou have been invited to join as a staff member.\n\nComplete your invitation here: ${inviteUrl}\n\nThis invitation expires in 7 days.`
        });

        resModel.success = true;
        resModel.message = "Staff invitation sent successfully";
        resModel.data = {
            id: staffUser._id,
            email: staffUser.email,
            inviteExpiresAt: inviteTokenExpiry,
            emailSent: Boolean(emailResult?.success)
        };
        return res.status(200).json(resModel);
    } catch (error) {
        console.error("Error in inviteStaff:", error);
        resModel.success = false;
        resModel.message = "Internal Server Error";
        resModel.data = null;
        return res.status(500).json(resModel);
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
        const {
            search,
            status,
            assignment,
            page = 1,
            limit = 50,
            sortBy = 'createdAt',
            sortOrder = 'desc'
        } = req.query;
        const normalizeValue = (value) => String(value || '').trim().toLowerCase();
        const normalizeKey = (value) => normalizeValue(value).replace(/[\s_-]/g, '');

        // Check if the requesting user is a super admin
        const adminUser = await User.findById(adminId);
        if (!adminUser || adminUser.role_id !== '1') {
            resModel.success = false;
            resModel.message = "Unauthorized. Only Super Admin can view staff";
            resModel.data = null;
            return res.status(403).json(resModel);
        }

        const pipeline = [
            { $match: { role_id: "2" } }, // Staff role
            {
                $addFields: {
                    clientCount: { 
                        $cond: {
                            if: { $isArray: "$assignedClients" },
                            then: { $size: "$assignedClients" },
                            else: 0
                        }
                    },
                    fullName: {
                        $trim: {
                            input: {
                                $concat: [
                                    { $ifNull: ["$first_name", ""] },
                                    " ",
                                    { $ifNull: ["$last_name", ""] }
                                ]
                            }
                        }
                    },
                    firstNameLower: { $toLower: { $ifNull: ["$first_name", ""] } },
                    lastNameLower: { $toLower: { $ifNull: ["$last_name", ""] } },
                    fullNameLower: {
                        $toLower: {
                            $trim: {
                                input: {
                                    $concat: [
                                        { $ifNull: ["$first_name", ""] },
                                        " ",
                                        { $ifNull: ["$last_name", ""] }
                                    ]
                                }
                            }
                        }
                    },
                    staffAccessStatus: {
                        $switch: {
                            branches: [
                                {
                                    case: { $eq: ["$active", true] },
                                    then: "active"
                                },
                                {
                                    case: {
                                        $and: [
                                            { $eq: ["$active", false] },
                                            {
                                                $or: [
                                                    { $eq: ["$inviteStatus", "pending"] },
                                                    { $eq: ["$inviteStatus", null] }
                                                ]
                                            },
                                            { $gt: ["$inviteTokenExpiry", new Date()] }
                                        ]
                                    },
                                    then: "invite_pending"
                                },
                                {
                                    case: {
                                        $and: [
                                            { $eq: ["$active", false] },
                                            {
                                                $or: [
                                                    { $eq: ["$inviteStatus", "pending"] },
                                                    { $eq: ["$inviteStatus", null] }
                                                ]
                                            },
                                            { $lte: ["$inviteTokenExpiry", new Date()] }
                                        ]
                                    },
                                    then: "invite_expired"
                                }
                            ],
                            default: "deactivated"
                        }
                    }
                }
            }
        ];

        // Search by first name, last name, full name, or email
        if (search) {
            const searchRegex = new RegExp(search.trim(), 'i');
            pipeline.push({
                $match: {
                    $or: [
                        { first_name: searchRegex },
                        { last_name: searchRegex },
                        { email: searchRegex },
                        { fullName: searchRegex }
                    ]
                }
            });
        }

        // Filter by staff status
        if (status) {
            const normalizedStatus = normalizeValue(status);
            const normalizedStatusKey = normalizeKey(status);

            if (normalizedStatus === 'active' || normalizedStatus === 'true' || normalizedStatus === '1') {
                pipeline.push({ $match: { staffAccessStatus: 'active' } });
            } else if (normalizedStatus === 'inactive' || normalizedStatus === 'false' || normalizedStatus === '0') {
                // Backward compatibility for old UI filters
                pipeline.push({
                    $match: {
                        staffAccessStatus: { $in: ['invite_pending', 'invite_expired', 'deactivated'] }
                    }
                });
            } else if (normalizedStatusKey === 'invitepending' || normalizedStatusKey === 'pendinginvite') {
                pipeline.push({ $match: { staffAccessStatus: 'invite_pending' } });
            } else if (normalizedStatusKey === 'inviteexpired' || normalizedStatusKey === 'expiredinvite') {
                pipeline.push({ $match: { staffAccessStatus: 'invite_expired' } });
            } else if (normalizedStatusKey === 'deactivated') {
                pipeline.push({ $match: { staffAccessStatus: 'deactivated' } });
            }
        }

        // Filter by assignment state: assigned / unassigned / all
        if (assignment) {
            const normalizedAssignment = normalizeKey(assignment);
            if (normalizedAssignment === 'assigned') {
                pipeline.push({ $match: { clientCount: { $gt: 0 } } });
            } else if (normalizedAssignment === 'unassigned') {
                pipeline.push({ $match: { clientCount: 0 } });
            }
        }

        // Sorting
        const normalizedSortBy = normalizeKey(sortBy);
        const normalizedSortOrder = normalizeValue(sortOrder);
        const sortDirection = (normalizedSortOrder === 'asc' || normalizedSortOrder === '1' || normalizedSortOrder === 'true') ? 1 : -1;
        const sortMap = {
            name: { fullNameLower: sortDirection, createdAt: -1 },
            fullname: { fullNameLower: sortDirection, createdAt: -1 },
            staffname: { fullNameLower: sortDirection, createdAt: -1 },
            firstname: { firstNameLower: sortDirection, createdAt: -1 },
            first_name: { firstNameLower: sortDirection, createdAt: -1 },
            lastname: { lastNameLower: sortDirection, createdAt: -1 },
            last_name: { lastNameLower: sortDirection, createdAt: -1 },
            email: { email: sortDirection },
            assignedclients: { clientCount: sortDirection },
            clientcount: { clientCount: sortDirection },
            status: { staffAccessStatus: sortDirection },
            createdat: { createdAt: sortDirection }
        };
        const appliedSort = sortMap[normalizedSortBy] || { createdAt: -1 };
        const parsedPage = Math.max(parseInt(page, 10) || 1, 1);
        const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
        const skip = (parsedPage - 1) * parsedLimit;

        pipeline.push({
            $facet: {
                data: [
                    { $sort: appliedSort },
                    { $skip: skip },
                    { $limit: parsedLimit },
                    {
                        $project: {
                            password: 0,
                            assignedClients: 0,
                            firstNameLower: 0,
                            lastNameLower: 0,
                            fullNameLower: 0
                        }
                    }
                ],
                metadata: [
                    { $count: 'totalItems' }
                ]
            }
        });

        const aggregateResult = await User.aggregate(pipeline);
        const staffMembers = aggregateResult?.[0]?.data || [];
        const totalItems = aggregateResult?.[0]?.metadata?.[0]?.totalItems || 0;
        const totalPages = Math.max(Math.ceil(totalItems / parsedLimit), 1);

        resModel.success = true;
        resModel.message = "Staff members retrieved successfully";
        resModel.data = {
            staffMembers,
            pagination: {
                currentPage: parsedPage,
                totalPages,
                totalItems,
                itemsPerPage: parsedLimit
            }
        };
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

        // Soft delete - keep account disabled and clear any invite flow state
        staffMember.active = false;
        staffMember.inviteToken = null;
        staffMember.inviteTokenExpiry = null;
        staffMember.inviteStatus = 'none';
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

        // Reactivate and clear any stale invite flow state
        staffMember.active = true;
        staffMember.inviteToken = null;
        staffMember.inviteTokenExpiry = null;
        staffMember.inviteStatus = 'none';
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
        const { clientId, staffId, notes } = req.body;
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
        if (staffMember.assignedClients && staffMember.assignedClients.includes(clientId)) {
            resModel.success = false;
            resModel.message = "Client is already assigned to this staff member";
            resModel.data = null;
            return res.status(400).json(resModel);
        }

        // Update both user documents (no transaction needed for development)
        // Add client to staff's assignedClients array
        await User.updateOne(
            { _id: staffId, role_id: '2' },
            { $addToSet: { assignedClients: clientId } }
        );

        // Set staff in client's assignedTo field and save notes
        await User.updateOne(
            { _id: clientId, role_id: '3' },
            { 
                $set: { 
                    assignedTo: staffId,
                    assignmentNotes: notes || ''
                } 
            }
        );

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
                clientId: clientId.toString(),
                clientName: `${client.first_name} ${client.last_name}`,
                clientEmail: client.email,
                assignedBy: adminId.toString(),
                assignedByName: `${adminUser.first_name} ${adminUser.last_name}`,
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
                staffId: staffId.toString(),
                staffName: `${staffMember.first_name} ${staffMember.last_name}`,
                staffEmail: staffMember.email,
                assignedBy: adminId.toString(),
                assignedByName: `${adminUser.first_name} ${adminUser.last_name}`,
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
        resModel.data = {
            staffId,
            clientId,
            staffName: `${staffMember.first_name} ${staffMember.last_name}`,
            clientName: `${client.first_name} ${client.last_name}`
        };
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

        // Update both user documents (no transaction needed for development)
        // Remove client from staff's assignedClients array
        await User.updateOne(
            { _id: staffId, role_id: '2' },
            { $pull: { assignedClients: clientId } }
        );

        // Clear staff in client's assignedTo field and notes
        await User.updateOne(
            { _id: clientId, role_id: '3' },
            { 
                $set: { 
                    assignedTo: null,
                    assignmentNotes: ''
                } 
            }
        );

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
 * Get Clients Assigned to a Staff Member
 * GET /api/admin/staff-clients/:id
 * Super Admin can view any staff's clients
 */
module.exports.getStaffClients = async (req, res) => {
    try {
        const { id } = req.params;
        const adminId = req.userInfo?.id;

        const {
            search,
            page = 1,
            limit = 20,
            sortBy = 'createdAt',
            sortOrder = 'desc'
        } = req.query;

        const normalizeValue = (value) => String(value || '').trim().toLowerCase();
        const normalizedSearch = normalizeValue(search);
        const normalizedSortBy = normalizeValue(sortBy);
        const sortDirection = normalizeValue(sortOrder) === 'asc' ? 1 : -1;

        const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
        const limitNumber = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);

        // Check if requesting user is super admin
        const adminUser = await User.findById(adminId);
        if (!adminUser || adminUser.role_id !== '1') {
            resModel.success = false;
            resModel.message = "Unauthorized. Only Super Admin can view staff clients";
            resModel.data = null;
            return res.status(403).json(resModel);
        }

        // Verify staff member
        const staffMember = await User.findById(id)
            .select('first_name last_name email phoneNumber active createdAt updatedAt role_id')
            .populate('assignedClients', 'first_name last_name email phoneNumber businessName active createdAt');

        if (!staffMember || staffMember.role_id !== '2') {
            resModel.success = false;
            resModel.message = "Staff member not found";
            resModel.data = null;
            return res.status(404).json(resModel);
        }

        let clients = staffMember.assignedClients || [];

        // 🔍 SEARCH FILTER
        if (normalizedSearch) {
            clients = clients.filter((client) => {
                const fullName = `${client.first_name || ''} ${client.last_name || ''}`.trim().toLowerCase();

                return (
                    (client.first_name || '').toLowerCase().includes(normalizedSearch) ||
                    (client.last_name || '').toLowerCase().includes(normalizedSearch) ||
                    fullName.includes(normalizedSearch) ||
                    (client.email || '').toLowerCase().includes(normalizedSearch) ||
                    (client.phoneNumber || '').toLowerCase().includes(normalizedSearch) ||
                    (client.businessName || '').toLowerCase().includes(normalizedSearch)
                );
            });
        }

        // 🔃 SORTING
        clients.sort((a, b) => {
            if (normalizedSortBy === 'name') {
                const aName = `${a.first_name || ''} ${a.last_name || ''}`.trim().toLowerCase();
                const bName = `${b.first_name || ''} ${b.last_name || ''}`.trim().toLowerCase();
                return aName.localeCompare(bName) * sortDirection;
            }

            if (normalizedSortBy === 'email') {
                return (a.email || '').localeCompare(b.email || '') * sortDirection;
            }

            if (normalizedSortBy === 'status') {
                return ((a.active === true ? 1 : 0) - (b.active === true ? 1 : 0)) * sortDirection;
            }

            const aCreated = new Date(a.createdAt || 0).getTime();
            const bCreated = new Date(b.createdAt || 0).getTime();
            return (aCreated - bCreated) * sortDirection;
        });

        // 📄 PAGINATION
        const totalItems = clients.length;
        const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / limitNumber);
        const skip = (pageNumber - 1) * limitNumber;

        const paginatedClients = clients.slice(skip, skip + limitNumber);

        resModel.success = true;
        resModel.message = "Staff details with assigned clients retrieved successfully";
        resModel.data = {
            staff: {
                _id: staffMember._id,
                first_name: staffMember.first_name,
                last_name: staffMember.last_name,
                email: staffMember.email,
                phoneNumber: staffMember.phoneNumber,
                active: staffMember.active,
                createdAt: staffMember.createdAt,
                updatedAt: staffMember.updatedAt
            },
            clients: paginatedClients,
            pagination: {
                totalItems,
                totalPages,
                currentPage: pageNumber,
                perPage: limitNumber
            },
            filters: {
                search: normalizedSearch || '',
                sortBy: normalizedSortBy || 'createdat',
                sortOrder: sortDirection === 1 ? 'asc' : 'desc'
            }
        };

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

        // Get all clients with their assigned staff
        const clients = await User.find({ role_id: '3' })
            .select('first_name last_name email phoneNumber businessName active createdAt assignedTo')
            .populate('assignedTo', 'first_name last_name email')
            .sort({ createdAt: -1 });

        // Get progress data for all clients
        const clientIds = clients.map(client => client._id);
        const progressMap = await progressService.getMultipleClientsProgress(clientIds);

        // Combine clients with their assignment info and progress
        const clientsWithAssignments = clients.map(client => {
            const clientObj = client.toObject();
            return {
                ...clientObj,
                assignedStaff: clientObj.assignedTo ? {
                    staffId: clientObj.assignedTo._id,
                    staffName: `${clientObj.assignedTo.first_name} ${clientObj.assignedTo.last_name}`,
                    staffEmail: clientObj.assignedTo.email
                } : null,
                progress: progressMap[client._id.toString()] || {
                    onboarding: { completed: false, step: null },
                    subscription: { status: 'none', planName: null, interval: null, expiresAt: null },
                    integrations: { amazon: false, shopify: false }
                }
            };
        });

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
