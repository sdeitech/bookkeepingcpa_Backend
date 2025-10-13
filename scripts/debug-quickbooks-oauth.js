const OAuthClient = require('intuit-oauth');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '../.env.dev') });

console.log('🔍 QuickBooks OAuth Configuration Debug');
console.log('==========================================');

// Check environment variables
const requiredVars = [
  'QUICKBOOKS_CLIENT_ID',
  'QUICKBOOKS_CLIENT_SECRET',
  'QUICKBOOKS_REDIRECT_URI',
  'QUICKBOOKS_ENVIRONMENT'
];

console.log('\n📋 Environment Variables Check:');
requiredVars.forEach(varName => {
  const value = process.env[varName];
  console.log(`  ${varName}: ${value ? '✅ Present' : '❌ Missing'}`);
  if (value && varName.includes('CLIENT')) {
    console.log(`    Value: ${value.substring(0, 10)}...`);
  } else if (value) {
    console.log(`    Value: ${value}`);
  }
});

// Test OAuth client initialization
console.log('\n🔧 OAuth Client Initialization:');
try {
  const oauthClient = new OAuthClient({
    clientId: process.env.QUICKBOOKS_CLIENT_ID,
    clientSecret: process.env.QUICKBOOKS_CLIENT_SECRET,
    environment: process.env.QUICKBOOKS_ENVIRONMENT || 'sandbox',
    redirectUri: process.env.QUICKBOOKS_REDIRECT_URI,
    logging: true
  });
  
  console.log('  ✅ OAuth client initialized successfully');
  console.log('  📍 Environment:', process.env.QUICKBOOKS_ENVIRONMENT || 'sandbox');
  console.log('  📍 Redirect URI:', process.env.QUICKBOOKS_REDIRECT_URI);
  
  // Test authorization URL generation
  console.log('\n🔗 Authorization URL Test:');
  const testState = 'test-user-123:abc-def-456';
  const scopes = [
    OAuthClient.scopes.Accounting,
    OAuthClient.scopes.OpenId,
    OAuthClient.scopes.Profile,
    OAuthClient.scopes.Email,
    OAuthClient.scopes.Phone,
    OAuthClient.scopes.Address
  ];
  
  const authUri = oauthClient.authorizeUri({
    scope: scopes,
    state: testState
  });
  
  console.log('  ✅ Authorization URL generated successfully');
  console.log('  📍 URL:', authUri);
  console.log('  📍 Scopes:', scopes.join(' '));
  
} catch (error) {
  console.log('  ❌ Failed to initialize OAuth client');
  console.log('  📍 Error:', error.message);
  console.log('  📍 Stack:', error.stack);
}

// Check redirect URI format
console.log('\n🌐 Redirect URI Analysis:');
const redirectUri = process.env.QUICKBOOKS_REDIRECT_URI;
if (redirectUri) {
  try {
    const url = new URL(redirectUri);
    console.log('  ✅ Valid URL format');
    console.log('  📍 Protocol:', url.protocol);
    console.log('  📍 Host:', url.host);
    console.log('  📍 Path:', url.pathname);
    
    // Check if it's HTTPS (required for production)
    if (process.env.QUICKBOOKS_ENVIRONMENT === 'production' && url.protocol !== 'https:') {
      console.log('  ⚠️  WARNING: Production environment requires HTTPS redirect URI');
    }
    
    // Check if ngrok
    if (url.host.includes('ngrok')) {
      console.log('  📍 Using ngrok tunnel - ensure it\'s active');
    }
    
  } catch (error) {
    console.log('  ❌ Invalid URL format');
    console.log('  📍 Error:', error.message);
  }
} else {
  console.log('  ❌ Redirect URI not set');
}

// Common issues checklist
console.log('\n📝 Common Issues Checklist:');
console.log('  1. Ensure ngrok tunnel is active (if using ngrok)');
console.log('  2. QuickBooks app redirect URI matches exactly');
console.log('  3. Client ID and Secret are correct');
console.log('  4. Authorization code is fresh (expires in ~10 minutes)');
console.log('  5. Code is only used once (single-use)');
console.log('  6. Environment (sandbox/production) matches QuickBooks app');

console.log('\n🔄 Next Steps:');
console.log('  1. If using ngrok, verify tunnel is running: ngrok http 8080');
console.log('  2. Update QuickBooks app redirect URI if ngrok URL changed');
console.log('  3. Test authorization flow with fresh code');
console.log('  4. Check server logs for detailed error messages');

console.log('\n==========================================');
console.log('✅ Debug script completed');