/**
 * Test script for Firebase Realtime Database notifications
 * This script simulates sending a notification signal through Firebase
 * to test the real-time delivery without polling
 */

require('dotenv').config();
const mongoose = require('mongoose');
const admin = require('firebase-admin');

// Initialize Firebase Admin
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
  client_x509_cert_url: process.env.FIREBASE_CERT_URL
};

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: process.env.FIREBASE_DATABASE_URL || `https://${process.env.FIREBASE_PROJECT_ID}-default-rtdb.firebaseio.com`
  });
}

const database = admin.database();

// MongoDB Models
const Notification = require('../api/models/notification');

async function connectToMongoDB() {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/cpa_db', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
}

async function createTestNotification(userId) {
  try {
    // Create notification in MongoDB
    const notification = new Notification({
      userId: userId,
      title: '🧪 Test Real-time Notification',
      message: `This is a test notification sent at ${new Date().toLocaleTimeString()} to verify Firebase real-time delivery works without polling!`,
      type: 'system',
      priority: 'high',
      isRead: false,
      createdAt: new Date(),
      metadata: {
        test: true,
        timestamp: Date.now(),
        source: 'test-firebase-realtime.js'
      }
    });

    const savedNotification = await notification.save();
    console.log('✅ Notification created in MongoDB:', savedNotification._id);
    return savedNotification;
  } catch (error) {
    console.error('❌ Error creating notification:', error);
    throw error;
  }
}

async function sendFirebaseSignal(userId, notificationId) {
  try {
    const signalRef = database.ref(`notifications/${userId}/${notificationId}`);
    
    const signal = {
      id: notificationId,
      action: 'new',
      timestamp: Date.now(),
      priority: 'high'
    };
    
    await signalRef.set(signal);
    console.log('🔥 Firebase signal sent successfully!');
    console.log('Signal details:', signal);
    
    // Auto-cleanup after 24 hours
    setTimeout(async () => {
      await signalRef.remove();
      console.log('🧹 Signal auto-cleaned from Firebase');
    }, 24 * 60 * 60 * 1000);
    
    return signal;
  } catch (error) {
    console.error('❌ Error sending Firebase signal:', error);
    throw error;
  }
}

async function testRealtimeNotification() {
  console.log('\n========================================');
  console.log('🧪 Firebase Real-time Notification Test');
  console.log('========================================\n');
  
  // Get user ID from command line or use default
  const userId = process.argv[2];
  
  if (!userId) {
    console.error('❌ Please provide a user ID as argument');
    console.log('Usage: node test-firebase-realtime.js <userId>');
    console.log('Example: node test-firebase-realtime.js 507f1f77bcf86cd799439011');
    process.exit(1);
  }
  
  console.log('📝 Test Configuration:');
  console.log('- User ID:', userId);
  console.log('- Firebase Project:', process.env.FIREBASE_PROJECT_ID);
  console.log('- Database URL:', process.env.FIREBASE_DATABASE_URL);
  console.log('- MongoDB URI:', process.env.MONGO_URI || 'mongodb://localhost:27017/cpa_db');
  console.log('\n');
  
  try {
    // Connect to MongoDB
    await connectToMongoDB();
    
    // Create test notification in MongoDB
    console.log('📝 Creating notification in MongoDB...');
    const notification = await createTestNotification(userId);
    
    // Send Firebase signal
    console.log('\n🔥 Sending Firebase real-time signal...');
    await sendFirebaseSignal(userId, notification._id.toString());
    
    console.log('\n✨ Test completed successfully!');
    console.log('\n📱 Check your browser:');
    console.log('1. The notification bell should update instantly (< 100ms)');
    console.log('2. No polling requests should be made');
    console.log('3. The notification should appear in the dropdown');
    console.log('4. Connection indicator should show "connected" (green)');
    console.log('\n👀 Monitor browser console for:');
    console.log('- "🔥🔥🔥 FIREBASE onChildAdded TRIGGERED!"');
    console.log('- "🔥 REAL-TIME: New notification received via Firebase"');
    
    // Keep script running for a few seconds to allow cleanup
    setTimeout(() => {
      console.log('\n👋 Test script completed. Exiting...');
      process.exit(0);
    }, 5000);
    
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test
testRealtimeNotification();