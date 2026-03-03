/**
 * Firebase Authentication Service
 * Generates custom tokens for frontend Firebase authentication
 */

const { auth } = require('../config/firebase.config');

class FirebaseAuthService {
  /**
   * Generate a custom Firebase token for a user
   * @param {String} userId - MongoDB user ID
   * @param {Object} additionalClaims - Optional additional claims to include in token
   * @returns {Promise<String>} Firebase custom token
   */
  async generateCustomToken(userId, additionalClaims = {}) {
    try {
      // Convert MongoDB ObjectId to string
      const uid = userId.toString();
      
      // Create custom token with user ID and optional claims
      const customToken = await auth.createCustomToken(uid, additionalClaims);
      
      console.log(`✅ Firebase custom token generated for user: ${uid}`);
      return customToken;
    } catch (error) {
      console.error('Error generating Firebase custom token:', error);
      throw new Error('Failed to generate Firebase authentication token');
    }
  }

  /**
   * Generate token with user metadata
   * @param {Object} user - User document from MongoDB
   * @returns {Promise<String>} Firebase custom token
   */
  async generateTokenForUser(user) {
    try {
      const additionalClaims = {
        role: user.role_id || user.role,
        email: user.email,
        name: `${user.first_name} ${user.last_name}`
      };
      
      return await this.generateCustomToken(user._id, additionalClaims);
    } catch (error) {
      console.error('Error generating token for user:', error);
      throw error;
    }
  }

  /**
   * Verify a Firebase ID token (if needed for additional security)
   * @param {String} idToken - Firebase ID token from frontend
   * @returns {Promise<Object>} Decoded token
   */
  async verifyIdToken(idToken) {
    try {
      const decodedToken = await auth.verifyIdToken(idToken);
      return decodedToken;
    } catch (error) {
      console.error('Error verifying Firebase ID token:', error);
      throw new Error('Invalid Firebase token');
    }
  }
}

module.exports = new FirebaseAuthService();
