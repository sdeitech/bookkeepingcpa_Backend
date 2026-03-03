/**
 * Firebase Authentication Routes
 */

const express = require('express');
const router = express.Router();
const firebaseAuthController = require('../controllers/firebaseAuthController');
const auth = require('../middleware/auth');

// Get Firebase custom token for authenticated user
router.get('/firebase-token', auth, firebaseAuthController.getFirebaseToken);

// Refresh Firebase token
router.post('/firebase-token/refresh', auth, firebaseAuthController.refreshFirebaseToken);

module.exports = router;
