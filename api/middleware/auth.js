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
                        
                        // Add role_id to userInfo
                        req.userInfo = {
                            ...decoded,
                            role_id: user.role_id
                        };
                        
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

// Export middleware functions
module.exports = auth;
module.exports.requireRole = requireRole;
module.exports.requireAdmin = requireRole(['1']); // Super Admin only
module.exports.requireStaff = requireRole(['1', '2']); // Admin and Staff
module.exports.requireClient = requireRole(['1', '2', '3']); // All authenticated users