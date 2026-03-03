/**
 * Firebase Authentication Controller
 * Handles Firebase custom token generation for authenticated users
 */

const firebaseAuthService = require('../services/firebaseAuth.service');

/**
 * Get Firebase custom token for authenticated user
 * GET /api/auth/firebase-token
 */
exports.getFirebaseToken = async (req, res) => {
  try {
    const user = req.user; // From auth middleware
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    // Generate Firebase custom token
    const firebaseToken = await firebaseAuthService.generateTokenForUser(user);

    return res.status(200).json({
      success: true,
      data: {
        firebaseToken,
        userId: user._id.toString()
      }
    });
  } catch (error) {
    console.error('Error getting Firebase token:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to generate Firebase token',
      error: error.message
    });
  }
};

/**
 * Refresh Firebase token
 * POST /api/auth/firebase-token/refresh
 */
exports.refreshFirebaseToken = async (req, res) => {
  try {
    const user = req.user;
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    // Generate new Firebase custom token
    const firebaseToken = await firebaseAuthService.generateTokenForUser(user);

    return res.status(200).json({
      success: true,
      data: {
        firebaseToken,
        userId: user._id.toString()
      }
    });
  } catch (error) {
    console.error('Error refreshing Firebase token:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to refresh Firebase token',
      error: error.message
    });
  }
};
