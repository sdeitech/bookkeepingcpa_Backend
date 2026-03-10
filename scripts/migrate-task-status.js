/**
 * Migration Script: Rename CANCELLED to ON_HOLD
 * 
 * This script updates all existing tasks with status 'CANCELLED' to 'ON_HOLD'
 * Run this once after deploying the status changes
 * 
 * Usage: node scripts/migrate-task-status.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ MongoDB connected');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

// Run migration
const migrateTaskStatus = async () => {
  try {
    console.log('🔄 Starting migration: CANCELLED → ON_HOLD');

    // Update tasks collection
    const result = await mongoose.connection.db.collection('tasks').updateMany(
      { status: 'CANCELLED' },
      { $set: { status: 'ON_HOLD' } }
    );

    console.log(`✅ Updated ${result.modifiedCount} tasks`);

    // Update status history entries
    const historyResult = await mongoose.connection.db.collection('tasks').updateMany(
      { 'statusHistory.status': 'CANCELLED' },
      { $set: { 'statusHistory.$[elem].status': 'ON_HOLD' } },
      { arrayFilters: [{ 'elem.status': 'CANCELLED' }] }
    );

    console.log(`✅ Updated ${historyResult.modifiedCount} status history entries`);

    console.log('✅ Migration completed successfully');
  } catch (error) {
    console.error('❌ Migration error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 MongoDB connection closed');
  }
};

// Run the migration
(async () => {
  await connectDB();
  await migrateTaskStatus();
})();
