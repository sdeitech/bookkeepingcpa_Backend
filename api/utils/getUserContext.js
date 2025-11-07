/**
 * User Context Helper
 * Provides consistent access to user ID across all controllers
 * Supports admin override for viewing client data
 */

/**
 * Get the effective user ID for the current request
 * @param {Object} req - Express request object
 * @returns {String} - User ID to use for data queries
 */
const getUserId = (req) => {
    // Use targetUserId if set (includes admin override cases)
    // Fallback to normal userInfo.id for backward compatibility
    return req.targetUserId || req.userInfo?.id;
};

/**
 * Check if current request is an admin override
 * @param {Object} req - Express request object
 * @returns {Boolean} - True if admin is accessing client data
 */
const isAdminOverride = (req) => {
    return req.isAdminOverride === true;
};

/**
 * Get the target user details (for admin override cases)
 * @param {Object} req - Express request object
 * @returns {Object|null} - Target user info or null
 */
const getTargetUser = (req) => {
    return req.targetUser || null;
};

module.exports = {
    getUserId,
    isAdminOverride,
    getTargetUser
};