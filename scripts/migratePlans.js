/**
 * Script to migrate subscription plans from old database to new local database
 * Run: node scripts/migratePlans.js
 */

require('dotenv').config({ path: '.env.dev' });
const mongoose = require('mongoose');

// Old database connection (MongoDB Atlas)
const OLD_DB_URI = 'mongodb+srv://mdobriyal7:Manish871@cluster0.qngwz8y.mongodb.net/mernstack?retryWrites=true&w=majority';

// New database connection (local)
const NEW_DB_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/plutify_db';

// Subscription Plan Schema (same as in models)
const subscriptionPlanSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true },
  description: { type: String, default: '' },
  features: [{ type: String, required: true }],
  pricePerMonth: { type: Number, required: true },
  pricePerYear: { type: Number },
  billingPeriod: { type: String, enum: ['monthly', 'yearly', 'both'], default: 'both' },
  isActive: { type: Boolean, default: true },
  isPopular: { type: Boolean, default: false },
  stripePriceIdMonthly: { type: String, unique: true, sparse: true },
  stripePriceIdYearly: { type: String, unique: true, sparse: true },
  stripeProductId: { type: String, unique: true, sparse: true },
  features: {
    amazonIntegration: { type: Boolean, default: false },
    walmartIntegration: { type: Boolean, default: false },
    shopifyIntegration: { type: Boolean, default: false },
    advancedAnalytics: { type: Boolean, default: false },
    prioritySupport: { type: Boolean, default: false },
    customReports: { type: Boolean, default: false }
  },
  trialDays: { type: Number, default: 7 },
  sortOrder: { type: Number, default: 0 },
  metadata: { type: Map, of: String, default: {} },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", required: true }
}, { timestamps: true, strict: false }); // strict: false to allow extra fields

async function migratePlans() {
  let oldConnection, newConnection;
  
  try {
    console.log('🔄 Starting migration...\n');
    
    // Connect to old database
    console.log('📡 Connecting to old database (MongoDB Atlas)...');
    oldConnection = await mongoose.createConnection(OLD_DB_URI);
    const OldSubscriptionPlan = oldConnection.model('SubscriptionPlan', subscriptionPlanSchema);
    console.log('✅ Connected to old database\n');
    
    // Connect to new database
    console.log('📡 Connecting to new database (local)...');
    newConnection = await mongoose.createConnection(NEW_DB_URI);
    const NewSubscriptionPlan = newConnection.model('SubscriptionPlan', subscriptionPlanSchema);
    console.log('✅ Connected to new database\n');
    
    // Fetch all plans from old database
    console.log('📥 Fetching plans from old database...');
    const oldPlans = await OldSubscriptionPlan.find({});
    console.log(`✅ Found ${oldPlans.length} plans in old database\n`);
    
    if (oldPlans.length === 0) {
      console.log('⚠️  No plans found in old database. Nothing to migrate.');
      return;
    }
    
    // Get admin user ID from new database (for createdBy field)
    const User = newConnection.model('User', new mongoose.Schema({}, { strict: false }));
    const adminUser = await User.findOne({ role_id: '1' });
    
    if (!adminUser) {
      console.log('⚠️  No admin user found in new database. Plans will be created without createdBy field.');
    }
    
    // Migrate each plan
    console.log('📤 Migrating plans to new database...\n');
    let successCount = 0;
    let skipCount = 0;
    
    for (const oldPlan of oldPlans) {
      try {
        // Check if plan already exists
        const existingPlan = await NewSubscriptionPlan.findOne({ name: oldPlan.name });
        
        if (existingPlan) {
          console.log(`⏭️  Skipping "${oldPlan.name}" - already exists`);
          skipCount++;
          continue;
        }
        
        // Convert old plan to new format
        const planData = oldPlan.toObject();
        
        // Remove _id to let MongoDB create a new one
        delete planData._id;
        delete planData.__v;
        
        // Set createdBy to admin user if available
        if (adminUser && !planData.createdBy) {
          planData.createdBy = adminUser._id;
        }
        
        // Create plan in new database
        const newPlan = new NewSubscriptionPlan(planData);
        await newPlan.save();
        
        console.log(`✅ Migrated: "${oldPlan.name}"`);
        successCount++;
        
      } catch (error) {
        console.error(`❌ Error migrating "${oldPlan.name}":`, error.message);
      }
    }
    
    console.log('\n📊 Migration Summary:');
    console.log(`   ✅ Successfully migrated: ${successCount}`);
    console.log(`   ⏭️  Skipped (already exists): ${skipCount}`);
    console.log(`   ❌ Failed: ${oldPlans.length - successCount - skipCount}`);
    
    // Verify migration
    console.log('\n🔍 Verifying migration...');
    const newPlans = await NewSubscriptionPlan.find({});
    console.log(`✅ New database now has ${newPlans.length} plans`);
    
  } catch (error) {
    console.error('❌ Migration error:', error);
  } finally {
    // Close connections
    if (oldConnection) {
      await oldConnection.close();
      console.log('\n🔌 Closed old database connection');
    }
    if (newConnection) {
      await newConnection.close();
      console.log('🔌 Closed new database connection');
    }
    process.exit(0);
  }
}

// Run migration
migratePlans();

