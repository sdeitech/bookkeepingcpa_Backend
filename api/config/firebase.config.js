/**
 * Firebase Admin SDK Configuration
 * This file initializes Firebase Admin SDK for backend operations
 */

const admin = require('firebase-admin');

// Initialize Firebase Admin
const initializeFirebase = () => {
  try {
    // Check if Firebase is already initialized
    if (admin.apps.length) {
      console.log('Firebase Admin already initialized');
      return {
        admin: admin,
        db: admin.firestore(),
        database: admin.database(), // Add Realtime Database
        messaging: admin.messaging(),
        auth: admin.auth()
      };
    }

    // Initialize with service account
    const serviceAccount = {
      type: "service_account",
      project_id: process.env.FIREBASE_PROJECT_ID,
      private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
      private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      client_id: process.env.FIREBASE_CLIENT_ID,
      auth_uri: "https://accounts.google.com/o/oauth2/auth",
      token_uri: "https://oauth2.googleapis.com/token",
      auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
      client_x509_cert_url: process.env.FIREBASE_CLIENT_CERT_URL
    };

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: process.env.FIREBASE_DATABASE_URL || `https://${process.env.FIREBASE_PROJECT_ID}-default-rtdb.firebaseio.com`
    });

    console.log('Firebase Admin initialized successfully');

    const db = admin.firestore();
    const database = admin.database(); // Initialize Realtime Database
    const messaging = admin.messaging();
    const auth = admin.auth();

    // Configure Firestore settings
    db.settings({
      timestampsInSnapshots: true,
      ignoreUndefinedProperties: true
    });

    return { admin, db, database, messaging, auth };
  } catch (error) {
    console.error('Error initializing Firebase Admin:', error);
    throw error;
  }
};

// Export initialized services
const firebase = initializeFirebase();

module.exports = {
  admin: firebase.admin,
  db: firebase.db,
  database: firebase.database, // Export Realtime Database
  messaging: firebase.messaging,
  auth: firebase.auth,
  FieldValue: admin.firestore.FieldValue,
  Timestamp: admin.firestore.Timestamp
};