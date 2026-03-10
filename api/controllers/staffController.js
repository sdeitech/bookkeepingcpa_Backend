const resModel = require('../lib/resModel');
const User = require("../models/userModel");
const Task = require("../models/taskModel");
const progressService = require('../services/progress.service');
const ShopifyStore = require('../models/shopifyStoreModel');
const AmazonSeller = require('../models/amazonSellerModel');
const QuickBooksCompany = require('../models/quickbooksCompanyModel');
const bcryptService = require('../services/bcrypt.services');
const jwtService = require('../services/jwt.services');

/**
 * Get Clients Assigned to Current Staff Member with Progress
 * GET /api/staff/my-clients
 * Staff can view their own assigned clients with progress indicators
 */
module.exports.getMyClients = async (req, res) => {
    try {
        const staffId = req.userInfo?.id;
        const {
            search,
            status = 'all',
            onboardingStatus = 'all',
            subscriptionStatus = 'all',
            sortBy = 'createdAt',
            sortOrder = 'desc'
        } = req.query;
        const normalizeValue = (value) => String(value || '').trim().toLowerCase();
        const normalizedSortBy = normalizeValue(sortBy).replace(/[\s_-]/g, '');
        const sortDirection = normalizeValue(sortOrder) === 'asc' ? 1 : -1;
        
        // Verify the user is a staff member
        const staffMember = await User.findById(staffId)
            .populate('assignedClients', 'first_name last_name email phoneNumber businessName active createdAt');
        
        if (!staffMember || staffMember.role_id !== '2') {
            resModel.success = false;
            resModel.message = "Unauthorized. Only staff can access this endpoint";
            resModel.data = null;
            return res.status(403).json(resModel);
        }
        
        // Get all clients assigned to this staff member
        const clients = staffMember.assignedClients || [];
        const clientIds = clients.map(client => client._id);
        
        // Get progress data for all assigned clients
        const progressMap = await progressService.getMultipleClientsProgress(clientIds);
        
        // Combine client data with progress
        let clientsWithProgress = clients.map(client => ({
            ...client.toObject(),
            progress: progressMap[client._id.toString()] || {
                onboarding: { completed: false, step: null },
                subscription: { status: 'none', planName: null, interval: null, expiresAt: null },
                integrations: { amazon: false, shopify: false }
            }
        }));

        // Search filter: first_name, last_name, email, phoneNumber, businessName
        if (search) {
            const term = normalizeValue(search);
            clientsWithProgress = clientsWithProgress.filter((client) => {
                const fullName = `${client.first_name || ''} ${client.last_name || ''}`.trim().toLowerCase();
                return (
                    (client.first_name || '').toLowerCase().includes(term) ||
                    (client.last_name || '').toLowerCase().includes(term) ||
                    fullName.includes(term) ||
                    (client.email || '').toLowerCase().includes(term) ||
                    (client.phoneNumber || '').toLowerCase().includes(term) ||
                    (client.businessName || '').toLowerCase().includes(term)
                );
            });
        }

        // Active status filter: active / inactive / all
        const normalizedStatus = normalizeValue(status);
        if (normalizedStatus === 'active') {
            clientsWithProgress = clientsWithProgress.filter((client) => client.active === true);
        } else if (normalizedStatus === 'inactive') {
            clientsWithProgress = clientsWithProgress.filter((client) => client.active === false);
        }

        // Onboarding filter: completed / pending / all
        const normalizedOnboardingStatus = normalizeValue(onboardingStatus);
        if (normalizedOnboardingStatus === 'completed') {
            clientsWithProgress = clientsWithProgress.filter((client) => client.progress?.onboarding?.completed === true);
        } else if (normalizedOnboardingStatus === 'pending') {
            clientsWithProgress = clientsWithProgress.filter((client) => client.progress?.onboarding?.completed !== true);
        }

        // Subscription filter: active / trial / canceled / none / all
        const normalizedSubscriptionStatus = normalizeValue(subscriptionStatus);
        if (normalizedSubscriptionStatus !== 'all') {
            clientsWithProgress = clientsWithProgress.filter((client) => {
                const currentStatus = normalizeValue(client.progress?.subscription?.status || 'none');
                return currentStatus === normalizedSubscriptionStatus;
            });
        }

        // Sorting
        const compareStrings = (a, b) => a.localeCompare(b);
        clientsWithProgress.sort((a, b) => {
            if (normalizedSortBy === 'name') {
                const aName = `${a.first_name || ''} ${a.last_name || ''}`.trim().toLowerCase();
                const bName = `${b.first_name || ''} ${b.last_name || ''}`.trim().toLowerCase();
                return compareStrings(aName, bName) * sortDirection;
            }
            if (normalizedSortBy === 'email') {
                return compareStrings((a.email || '').toLowerCase(), (b.email || '').toLowerCase()) * sortDirection;
            }
            if (normalizedSortBy === 'status') {
                return ((a.active === true ? 1 : 0) - (b.active === true ? 1 : 0)) * sortDirection;
            }

            // Default sort: createdAt
            const aCreatedAt = new Date(a.createdAt || 0).getTime();
            const bCreatedAt = new Date(b.createdAt || 0).getTime();
            return (aCreatedAt - bCreatedAt) * sortDirection;
        });
        
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
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        const endOfToday = new Date();
        endOfToday.setHours(23, 59, 59, 999);
        
        // Verify the user is a staff member
        const staffMember = await User.findById(staffId);
        if (!staffMember || staffMember.role_id !== '2') {
            resModel.success = false;
            resModel.message = "Unauthorized. Only staff can access this endpoint";
            resModel.data = null;
            return res.status(403).json(resModel);
        }
        
        // Get assigned clients count
        const staffMemberWithClients = await User.findById(staffId).select('assignedClients');
        const assignedClientsCount = staffMemberWithClients?.assignedClients?.length || 0;
        
        // Get assigned clients details
        const staffWithClients = await User.findById(staffId)
            .populate({
                path: 'assignedClients',
                select: 'first_name last_name email phoneNumber active',
                options: { limit: 5, sort: { createdAt: -1 } }
            });
        
        const recentClients = staffWithClients?.assignedClients || [];
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
        const allClientIds = staffMemberWithClients?.assignedClients || [];
        const allProgressMap = await progressService.getMultipleClientsProgress(allClientIds);

        const [activeClientsCount, pendingTasks, completedToday] = await Promise.all([
            allClientIds.length > 0
                ? User.countDocuments({ _id: { $in: allClientIds }, role_id: '3', active: true })
                : Promise.resolve(0),
            allClientIds.length > 0
                ? Task.countDocuments({
                    isDeleted: { $ne: true },
                    clientId: { $in: allClientIds },
                    status: { $nin: ['COMPLETED', 'CANCELLED'] }
                })
                : Promise.resolve(0),
            allClientIds.length > 0
                ? Task.countDocuments({
                    isDeleted: { $ne: true },
                    clientId: { $in: allClientIds },
                    status: 'COMPLETED',
                    completedAt: { $gte: startOfToday, $lte: endOfToday }
                })
                : Promise.resolve(0)
        ]);
        
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
                pendingTasks,
                completedToday,
                activeClients: activeClientsCount,
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

/**
 * Complete Staff Invitation
 * POST /api/staff/complete-invite
 * Public endpoint - validates invite token and sets password
 */
module.exports.completeInvite = async (req, res) => {
    try {
        const { token, password, confirmPassword, first_name, last_name } = req.body;

        if (password !== confirmPassword) {
            resModel.success = false;
            resModel.message = "Password and confirm password must match";
            resModel.data = null;
            return res.status(400).json(resModel);
        }

        const staffUser = await User.findOne({
            inviteToken: token,
            inviteTokenExpiry: { $gt: new Date() },
            $or: [
                { inviteStatus: 'pending' },
                { inviteStatus: null }
            ],
            role_id: '2'
        });

        if (!staffUser) {
            resModel.success = false;
            resModel.message = "Invalid or expired invite token";
            resModel.data = null;
            return res.status(400).json(resModel);
        }

        const passwordHash = await bcryptService.generatePassword(password);
        staffUser.password = passwordHash;
        staffUser.first_name = first_name || staffUser.first_name;
        staffUser.last_name = last_name || staffUser.last_name;
        staffUser.inviteToken = null;
        staffUser.inviteTokenExpiry = null;
        staffUser.inviteStatus = 'accepted';
        staffUser.active = true;
        await staffUser.save();

        const accessToken = await jwtService.issueJwtToken({
            email: staffUser.email,
            id: staffUser._id,
            first_name: staffUser.first_name,
            role_id: staffUser.role_id
        });

        staffUser.password = undefined;

        resModel.success = true;
        resModel.message = "Staff invitation completed successfully";
        resModel.data = { token: accessToken, user: staffUser };
        return res.status(200).json(resModel);
    } catch (error) {
        console.error("Error in completeInvite:", error);
        resModel.success = false;
        resModel.message = "Internal Server Error";
        resModel.data = null;
        return res.status(500).json(resModel);
    }
};

module.exports.getClientProfile = async (req, res) => {
    try {
        const { clientId } = req.params;
        const staffId = req.userInfo?.id;

        // Verify staff role
        const staffMember = await User.findById(staffId);
        if (!staffMember || staffMember.role_id !== '2') {
            resModel.success = false;
            resModel.message = "Unauthorized. Only staff can access this endpoint";
            resModel.data = null;
            return res.status(403).json(resModel);
        }

        // Ensure this client is assigned to current staff
        const staffMemberWithClients = await User.findById(staffId).select('assignedClients');
        const isAssigned = staffMemberWithClients?.assignedClients?.some(
            id => id.toString() === clientId
        );
        
        if (!isAssigned) {
            resModel.success = false;
            resModel.message = "You can only access profiles of clients assigned to you";
            resModel.data = null;
            return res.status(403).json(resModel);
        }

        // Get client details
        const client = await User.findById(clientId)
            .select('-password -resetPasswordToken -resetPasswordExpires');

        if (!client || client.role_id !== '3') {
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
        console.error('Get staff client profile error:', error);
        resModel.success = false;
        resModel.message = error.message || 'Failed to get client profile';
        resModel.data = null;
        return res.status(500).json(resModel);
    }
};
