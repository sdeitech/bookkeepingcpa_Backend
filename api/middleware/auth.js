const jwtService = require('../services/jwt.services');
const User = require('../models/userModel');

// Basic authentication middleware
const auth = async (req, res, next) => {
    var accesstoken = req.headers.authorization;
    if (accesstoken) {
        verifyToken = accesstoken.split(' ')
        if (verifyToken.length == 2) {
            if (verifyToken[0] == "Bearer") {
                await jwtService.verifyJwtToken(verifyToken[1], async function (err, decoded) {
                    if (err) {
                        return res.status(401).json({ success: false, data: null, message: "Invalid token" })
                    } else {
                        // Get user details including role
                        const user = await User.findById(decoded.id).select('role_id active');
                        if (!user) {
                            return res.status(401).json({ success: false, data: null, message: "User not found" })
                        }
                        if (!user.active) {
                            return res.status(403).json({ success: false, data: null, message: "Account deactivated" })
                        }
                        
                        // Add role_id to userInfo
                        req.userInfo = {
                            ...decoded,
                            role_id: user.role_id
                        };
                        next();
                    }
                });
            } else {
                return res.status(401).json({ success: false, data: null, message: "Invalid request" })
            }
        }
        else {
            return res.status(401).json({ success: false, data: null, message: "Invalid request" })
        }
    } else {
        return res.status(401).json({ success: false, data: null, message: "Token is Required" })
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