#!/usr/bin/env node

const path = require('path');
const dotenv = require('dotenv');

// Load environment variables based on NODE_ENV
const envFile = `.env.${process.env.NODE_ENV || 'dev'}`;
const envPath = path.resolve(__dirname, '..', envFile);

console.log('=================================');
console.log('QuickBooks Environment Debug');
console.log('=================================\n');

console.log(`NODE_ENV: ${process.env.NODE_ENV || 'not set (defaulting to dev)'}`);
console.log(`Loading env from: ${envPath}`);

// Load the env file
const result = dotenv.config({ path: envPath });

if (result.error) {
  console.error(`\n❌ Error loading ${envFile}:`, result.error);
} else {
  console.log(`✅ Successfully loaded ${envFile}\n`);
}

console.log('QuickBooks Configuration:');
console.log('-------------------------');
console.log(`PORT: ${process.env.PORT}`);
console.log(`QUICKBOOKS_CLIENT_ID: ${process.env.QUICKBOOKS_CLIENT_ID}`);
console.log(`QUICKBOOKS_REDIRECT_URI: ${process.env.QUICKBOOKS_REDIRECT_URI}`);
console.log(`QUICKBOOKS_ENVIRONMENT: ${process.env.QUICKBOOKS_ENVIRONMENT}`);
console.log(`FRONTEND_URL: ${process.env.FRONTEND_URL}`);

console.log('\n=================================');
console.log('Verification Steps:');
console.log('=================================');
console.log('1. The QUICKBOOKS_REDIRECT_URI above should show your ngrok URL');
console.log('2. If it shows localhost:8080, the .env.dev file hasn\'t been loaded');
console.log('3. Make sure to restart your backend server after updating .env.dev');
console.log('\nTo fix:');
console.log('1. Stop your backend server (Ctrl+C)');
console.log('2. Run: npm run dev');
console.log('3. The server should now use the ngrok URL');