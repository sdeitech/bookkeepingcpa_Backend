/**
 * Admin Override Middleware
 * Allows admins to access any client's data by passing clientId parameter
 */

const User = require('../models/userModel');
const resModel = require('../lib/resModel');

/**
 * Middleware to handle admin override for accessing client data
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Function} next - Next middleware function
 */
const adminOverride = async (req, res, next) => {
  try {
    const currentUser = req.userInfo; // User info from auth middleware
    const { clientId } = req.query; // Client ID from query params (for admin use)
    
    // Check if user is admin (role_id: 1) and wants to view specific client data
    if (currentUser.role_id === '1' && clientId) {
      console.log(`Admin ${currentUser.id} accessing client ${clientId} data`);
      
      // Verify the clientId is valid and belongs to a client (role_id: 3)
      const client = await User.findById(clientId);
      
      if (!client) {
        resModel.success = false;
        resModel.message = "Client not found";
        resModel.data = null;
        return res.status(404).json(resModel);
      }
      
      if (client.role_id !== '3') {
        resModel.success = false;
        resModel.message = "User is not a client";
        resModel.data = null;
        return res.status(400).json(resModel);
      }
      
      // Override the user ID with client's ID for data access
      req.targetUserId = clientId;
      req.targetUser = client;
      req.isAdminOverride = true; // Flag to indicate admin access
      
      // Log admin access for audit purposes
      console.log(`Admin Access Log: Admin ${currentUser.email} accessed client ${client.email} data at ${new Date().toISOString()}`);
      
    } else if (currentUser.role_id === '2' && clientId) {
      // Staff member trying to access client data
      // We could implement staff-client assignment check here
      resModel.success = false;
      resModel.message = "Staff members cannot directly access client integration data. Please contact admin.";
      resModel.data = null;
      return res.status(403).json(resModel);
      
    } else {
      // Regular user accessing their own data
      req.targetUserId = currentUser.id;
      req.targetUser = currentUser;
      req.isAdminOverride = false;
    }
    
    next();
  } catch (error) {
    console.error('Error in adminOverride middleware:', error);
    resModel.success = false;
    resModel.message = "Internal server error in admin override";
    resModel.data = null;
    res.status(500).json(resModel);
  }
};

/**
 * Middleware to ensure only admins can access certain endpoints
 */
const adminOnly = (req, res, next) => {
  const currentUser = req.userInfo;
  
  if (currentUser.role_id !== '1') {
    resModel.success = false;
    resModel.message = "Access denied. Admin privileges required.";
    resModel.data = null;
    return res.status(403).json(resModel);
  }
  
  next();
};

/**
 * Middleware to log admin actions for audit trail
 */
const logAdminAction = (action) => {
  return (req, res, next) => {
    if (req.isAdminOverride) {
      console.log(`[ADMIN AUDIT] Action: ${action}, Admin: ${req.userInfo.email}, Target Client: ${req.targetUser?.email}, Timestamp: ${new Date().toISOString()}`);
    }
    next();
  };
};

module.exports = {
  adminOverride,
  adminOnly,
  logAdminAction
};