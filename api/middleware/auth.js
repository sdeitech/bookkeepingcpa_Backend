const jwtService = require('../services/jwt.services');
const User = require('../models/userModel');

// Basic authentication middleware
const auth = async (req, res, next) => {
    var accesstoken = req.headers.authorization;
    
    // Debug logging
    if (process.env.NODE_ENV === 'development') {
        console.log('[Auth Middleware] Authorization header:', accesstoken ? 'Present' : 'Missing');
        console.log('[Auth Middleware] Request URL:', req.originalUrl);
    }
    
    if (accesstoken) {
        verifyToken = accesstoken.split(' ')
        if (verifyToken.length == 2) {
            if (verifyToken[0] == "Bearer") {
                await jwtService.verifyJwtToken(verifyToken[1], async function (err, decoded) {
                    if (err) {
                        // Enhanced error logging for debugging
                        console.error('[Auth Middleware] JWT verification failed:', err.message);
                        console.error('[Auth Middleware] Token (first 20 chars):', verifyToken[1] ? verifyToken[1].substring(0, 20) + '...' : 'undefined');
                        
                        // Check for specific JWT errors
                        if (err.name === 'TokenExpiredError') {
                            return res.status(401).json({
                                success: false,
                                data: null,
                                message: "Token expired",
                                error: "TOKEN_EXPIRED"
                            });
                        } else if (err.name === 'JsonWebTokenError') {
                            return res.status(401).json({
                                success: false,
                                data: null,
                                message: "Invalid token format",
                                error: "INVALID_TOKEN_FORMAT"
                            });
                        }
                        
                        return res.status(401).json({
                            success: false,
                            data: null,
                            message: "Invalid token",
                            error: "INVALID_TOKEN"
                        });
                    } else {
                        // Get user details including role
                        const user = await User.findById(decoded.id).select('role_id active');
                        if (!user) {
                            console.error('[Auth Middleware] User not found for ID:', decoded.id);
                            return res.status(401).json({
                                success: false,
                                data: null,
                                message: "User not found",
                                error: "USER_NOT_FOUND"
                            });
                        }
                        if (!user.active) {
                            return res.status(403).json({
                                success: false,
                                data: null,
                                message: "Account deactivated",
                                error: "ACCOUNT_DEACTIVATED"
                            });
                        }
                        
                        // Add role_id to userInfo and also set req.user for controllers
                        req.userInfo = {
                            ...decoded,
                            role_id: user.role_id
                        };
                        
                        // Also set req.user for task controller compatibility
                        req.user = {
                            _id: decoded.id,
                            id: decoded.id,
                            email: decoded.email,
                            role_id: user.role_id,
                            role: user.role_id === '1' ? 'ADMIN' : user.role_id === '2' ? 'STAFF' : 'CLIENT'
                        };
                        
                        // Admin override: Allow admin to access client data via clientId query parameter
                        if (user.role_id === '1' && req.query.clientId) {
                            // Verify the target client exists
                            const targetClient = await User.findById(req.query.clientId).select('_id email name active');
                            
                            if (!targetClient) {
                                return res.status(404).json({
                                    success: false,
                                    data: null,
                                    message: "Target client not found",
                                    error: "CLIENT_NOT_FOUND"
                                });
                            }
                            
                            if (!targetClient.active) {
                                return res.status(403).json({
                                    success: false,
                                    data: null,
                                    message: "Target client account is inactive",
                                    error: "CLIENT_INACTIVE"
                                });
                            }
                            
                            // Set target user context for admin access
                            req.targetUserId = req.query.clientId;
                            req.isAdminOverride = true;
                            req.targetUser = {
                                id: targetClient._id.toString(),
                                email: targetClient.email,
                                name: targetClient.name
                            };
                            
                            console.log(`[Admin Override] Admin ${decoded.email} accessing client ${targetClient.email} data`);
                        } else {
                            // Normal user accessing their own data
                            req.targetUserId = decoded.id;
                            req.isAdminOverride = false;
                        }
                        
                        if (process.env.NODE_ENV === 'development') {
                            console.log('[Auth Middleware] Authentication successful for user:', decoded.email);
                        }
                        
                        next();
                    }
                });
            } else {
                return res.status(401).json({
                    success: false,
                    data: null,
                    message: "Invalid authorization format",
                    error: "INVALID_AUTH_FORMAT"
                });
            }
        }
        else {
            return res.status(401).json({
                success: false,
                data: null,
                message: "Invalid authorization header",
                error: "INVALID_AUTH_HEADER"
            });
        }
    } else {
        return res.status(401).json({
            success: false,
            data: null,
            message: "Token is Required",
            error: "TOKEN_REQUIRED"
        });
    }
};

// Role-based access control middleware
const requireRole = (allowedRoles) => {
    return (req, res, next) => {
        if (!req.userInfo || !req.userInfo.role_id) {
            return res.status(401).json({ 
                success: false, 
                data: null, 
                message: "Authentication required" 
            });
        }
        
        // Check if user's role is in the allowed roles
        if (!allowedRoles.includes(req.userInfo.role_id)) {
            return res.status(403).json({ 
                success: false, 
                data: null, 
                message: "Insufficient permissions to access this resource" 
            });
        }
        
        next();
    };
};

const authorize = (resource, action) => {
    return async (req, res, next) => {
      try {
        const user = req.userInfo; // From your existing auth middleware
        
        // Route to specific authorization logic
        switch (resource) {
          case 'task':
            return await authorizeTask(req, res, next, user, action);
          case 'message':
            return await authorizeMessage(req, res, next, user, action);
          case 'document':
            return await authorizeDocument(req, res, next, user, action);
          case 'settings':
            return await authorizeSettings(req, res, next, user, action);
          default:
            return res.status(400).json({
              success: false,
              message: 'Invalid resource type'
            });
        }
      } catch (error) {
        console.error('Authorization error:', error);
        return res.status(500).json({
          success: false,
          message: 'Authorization failed',
          error: error.message
        });
      }
    };
  };
  
  // ============================================
  // TASK AUTHORIZATION
  // ============================================
  async function authorizeTask(req, res, next, user, action) {
    const Task = require('../models/taskModel'); // Import here to avoid circular dependency
    const User = require('../models/userModel');
    const taskId = req.params.taskId || req.params.id;
    
    // Admin (role_id = '1') has full access to everything
    if (user.role_id === '1') {
      if (action === 'view' || action === 'update' || action === 'upload' || 
          action === 'approve' || action === 'reject' || action === 'help' || 
          action === 'updateStatus') {
        const task = await Task.findById(taskId);
        if (!task) {
          return res.status(404).json({ success: false, message: 'Task not found' });
        }
        req.task = task;
      }
      return next();
    }
    
    switch (action) {
      case 'create':
        return await canCreateTask(req, res, next, user);
        
      case 'view':
      case 'update':
      case 'upload':
      case 'approve':
      case 'reject':
      case 'help':
        return await canAccessTask(req, res, next, user, taskId);
        
      case 'updateStatus':
        return await canUpdateTaskStatus(req, res, next, user, taskId);
        
      case 'delete':
        // Only admin can delete (already handled above)
        return res.status(403).json({
          success: false,
          message: 'Only administrators can delete tasks'
        });
        
      default:
        return res.status(400).json({
          success: false,
          message: 'Invalid action'
        });
    }
  }
  
  // Can create task?
  async function canCreateTask(req, res, next, user) {
    const User = require('../models/userModel');
    const { assignedTo, clientId } = req.body;
    
    // Staff (role_id = '2') can create only for their assigned clients
    if (user.role_id === '2') {
      const targetUser = await User.findById(assignedTo || clientId);
      
      if (!targetUser) {
        return res.status(404).json({
          success: false,
          message: 'Target user not found'
        });
      }
      
      // Check if target is a client (role_id = '3') assigned to this staff
      if (targetUser.role_id === '3') {
        // Check assignment (you'll need to add assignedStaff field to User model)
        const AssignClient = require('../models/assignClientsModel');
        const assignment = await AssignClient.findOne({
          clientId: targetUser._id,
          staffId: user.id
        });
        
        if (assignment) {
          return next();
        }
      }
      
      return res.status(403).json({
        success: false,
        message: 'You can only create tasks for your assigned clients'
      });
    }
    
    // Client (role_id = '3') cannot create tasks
    return res.status(403).json({
      success: false,
      message: 'Clients cannot create tasks'
    });
  }
  
  // Can access task?
  async function canAccessTask(req, res, next, user, taskId) {
    const Task = require('../models/taskModel');
    const task = await Task.findById(taskId);
    
    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }
    
    // Staff (role_id = '2') can access tasks for their assigned clients OR tasks assigned to them
    if (user.role_id === '2') {
      const AssignClient = require('../models/assignClientsModel');
      const assignment = await AssignClient.findOne({
        clientId: task.clientId,
        staffId: user.id
      });
      
      const isAssignedToStaff = task.assignedTo.toString() === user.id;
      
      if (assignment || isAssignedToStaff) {
        req.task = task;
        return next();
      }
    }
    
    // Client (role_id = '3') can access only their own tasks
    if (user.role_id === '3') {
      if (task.assignedTo.toString() === user.id) {
        req.task = task;
        return next();
      }
    }
    
    return res.status(403).json({
      success: false,
      message: 'Access denied'
    });
  }
  
  // Can update task status?
  async function canUpdateTaskStatus(req, res, next, user, taskId) {
    const Task = require('../models/taskModel');
    const task = await Task.findById(taskId);
    const { status } = req.body;
    
    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }
    
    // Validate status transitions
    const validTransitions = {
      'NOT_STARTED': ['IN_PROGRESS'],
      'IN_PROGRESS': ['PENDING_REVIEW', 'COMPLETED'],
      'PENDING_REVIEW': ['NEEDS_REVISION', 'COMPLETED'],
      'NEEDS_REVISION': ['IN_PROGRESS'],
      'COMPLETED': [],
      'CANCELLED': []
    };
    
    if (!validTransitions[task.status]?.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status transition from ${task.status} to ${status}`
      });
    }
    
    // Staff (role_id = '2') can update if task is for their client OR assigned to them
    if (user.role_id === '2') {
      const AssignClient = require('../models/assignClientsModel');
      const assignment = await AssignClient.findOne({
        clientId: task.clientId,
        staffId: user.id
      });
      
      const isAssignedToStaff = task.assignedTo.toString() === user.id;
      
      if (assignment || isAssignedToStaff) {
        req.task = task;
        return next();
      }
    }
    
    // Client (role_id = '3') can update their own tasks (limited transitions)
    if (user.role_id === '3') {
      if (task.assignedTo.toString() === user.id) {
        const clientAllowedStatuses = ['NOT_STARTED', 'IN_PROGRESS', 'PENDING_REVIEW'];
        if (clientAllowedStatuses.includes(status)) {
          req.task = task;
          return next();
        }
      }
    }
    
    return res.status(403).json({
      success: false,
      message: 'Access denied'
    });
  }
  
  // ============================================
  // MESSAGE AUTHORIZATION (for future)
  // ============================================
  async function authorizeMessage(req, res, next, user, action) {
    // Implement when you build messaging
    return next();
  }
  
  // ============================================
  // DOCUMENT AUTHORIZATION (for future)
  // ============================================
  async function authorizeDocument(req, res, next, user, action) {
    // Implement when you build document review
    return next();
  }
  
  // ============================================
  // SETTINGS AUTHORIZATION
  // ============================================
  async function authorizeSettings(req, res, next, user, action) {
    // Only admin (role_id = '1') can access settings
    if (user.role_id === '1') {
      return next();
    }
    
    return res.status(403).json({
      success: false,
      message: 'Only administrators can access settings'
    });
  }
  
  // ============================================
  // EXPORTS
  // ============================================
  module.exports = auth;
  module.exports.requireRole = requireRole;
  module.exports.requireAdmin = requireRole(['1']);
  module.exports.requireStaff = requireRole(['1', '2']);
  module.exports.requireClient = requireRole(['1', '2', '3']);
  module.exports.authorize = authorize;