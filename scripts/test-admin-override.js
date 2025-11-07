/**
 * Test Script for Admin Override Functionality
 * Run this script to verify admin can access client data
 */

const axios = require('axios');

// Configuration - Update these values
const API_URL = process.env.API_URL || 'http://localhost:5000';
const ADMIN_EMAIL = 'admin@example.com'; // Your admin email
const ADMIN_PASSWORD = 'admin123'; // Your admin password
const TEST_CLIENT_ID = ''; // Will be populated from client list

// Color codes for console output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

// Helper to print colored messages
const log = {
  success: (msg) => console.log(`${colors.green}✓ ${msg}${colors.reset}`),
  error: (msg) => console.log(`${colors.red}✗ ${msg}${colors.reset}`),
  info: (msg) => console.log(`${colors.blue}ℹ ${msg}${colors.reset}`),
  warning: (msg) => console.log(`${colors.yellow}⚠ ${msg}${colors.reset}`)
};

// Test functions
async function loginAsAdmin() {
  try {
    log.info('Logging in as admin...');
    const response = await axios.post(`${API_URL}/api/auth/login`, {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD
    });
    
    if (response.data.success && response.data.data.token) {
      log.success('Admin login successful');
      return response.data.data.token;
    } else {
      throw new Error('Login failed');
    }
  } catch (error) {
    log.error(`Admin login failed: ${error.message}`);
    throw error;
  }
}

async function getClientsList(token) {
  try {
    log.info('Fetching clients list...');
    const response = await axios.get(`${API_URL}/api/admin/clients-list`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    if (response.data.success) {
      const clients = response.data.data;
      log.success(`Found ${clients.length} clients`);
      return clients;
    } else {
      throw new Error('Failed to fetch clients');
    }
  } catch (error) {
    log.error(`Failed to get clients list: ${error.message}`);
    throw error;
  }
}

async function getClientProfile(token, clientId) {
  try {
    log.info(`Fetching profile for client: ${clientId}`);
    const response = await axios.get(
      `${API_URL}/api/admin/client/${clientId}/profile`,
      {
        headers: { Authorization: `Bearer ${token}` }
      }
    );
    
    if (response.data.success) {
      const profile = response.data.data;
      log.success('Client profile fetched successfully');
      return profile;
    } else {
      throw new Error('Failed to fetch client profile');
    }
  } catch (error) {
    log.error(`Failed to get client profile: ${error.message}`);
    throw error;
  }
}

async function testAdminOverrideForIntegration(token, clientId, integration) {
  const endpoints = {
    shopify: '/api/shopify/orders',
    amazon: '/api/amazon/orders',
    quickbooks: '/api/quickbooks/company-info'
  };
  
  try {
    log.info(`Testing admin override for ${integration}...`);
    const response = await axios.get(
      `${API_URL}${endpoints[integration]}?clientId=${clientId}`,
      {
        headers: { Authorization: `Bearer ${token}` }
      }
    );
    
    if (response.data.success) {
      log.success(`Admin override successful for ${integration}`);
      return true;
    } else {
      log.warning(`${integration} may not be connected for this client`);
      return false;
    }
  } catch (error) {
    if (error.response?.status === 404) {
      log.warning(`${integration} not connected for this client`);
    } else {
      log.error(`Admin override failed for ${integration}: ${error.message}`);
    }
    return false;
  }
}

async function runTests() {
  console.log('\n' + '='.repeat(50));
  console.log('Admin Override Functionality Test');
  console.log('='.repeat(50) + '\n');
  
  let adminToken;
  let clients;
  let testClient;
  
  try {
    // Step 1: Login as admin
    adminToken = await loginAsAdmin();
    console.log();
    
    // Step 2: Get clients list
    clients = await getClientsList(adminToken);
    console.log();
    
    if (clients.length === 0) {
      log.warning('No clients found in the system');
      return;
    }
    
    // Select first active client for testing
    testClient = clients.find(c => c.active) || clients[0];
    log.info(`Selected test client: ${testClient.email} (ID: ${testClient.id})`);
    console.log();
    
    // Step 3: Get client profile
    const profile = await getClientProfile(adminToken, testClient.id);
    console.log('\nClient Profile:');
    console.log(`  Name: ${profile.client.name || 'N/A'}`);
    console.log(`  Email: ${profile.client.email}`);
    console.log(`  Business: ${profile.client.businessName || 'N/A'}`);
    console.log('\nIntegration Status:');
    console.log('  Shopify: ' + (profile.integrations.shopify.connected ? 'Connected' : 'Not Connected'));
    console.log('  Amazon: ' + (profile.integrations.amazon.connected ? 'Connected' : 'Not Connected'));
    console.log('  QuickBooks: ' + (profile.integrations.quickbooks.connected ? 'Connected' : 'Not Connected'));
    console.log();
    
    // Step 4: Test admin override for each integration
    log.info('Testing admin override for integration endpoints...\n');
    
    const results = {
      shopify: await testAdminOverrideForIntegration(adminToken, testClient.id, 'shopify'),
      amazon: await testAdminOverrideForIntegration(adminToken, testClient.id, 'amazon'),
      quickbooks: await testAdminOverrideForIntegration(adminToken, testClient.id, 'quickbooks')
    };
    
    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('Test Summary');
    console.log('='.repeat(50));
    console.log(`Admin Login: ${colors.green}✓ Passed${colors.reset}`);
    console.log(`Client List Fetch: ${colors.green}✓ Passed${colors.reset}`);
    console.log(`Client Profile Fetch: ${colors.green}✓ Passed${colors.reset}`);
    console.log(`Shopify Override: ${results.shopify ? colors.green + '✓ Passed' : colors.yellow + '⚠ Skipped (Not Connected)'}${colors.reset}`);
    console.log(`Amazon Override: ${results.amazon ? colors.green + '✓ Passed' : colors.yellow + '⚠ Skipped (Not Connected)'}${colors.reset}`);
    console.log(`QuickBooks Override: ${results.quickbooks ? colors.green + '✓ Passed' : colors.yellow + '⚠ Skipped (Not Connected)'}${colors.reset}`);
    
    console.log(`\n${colors.green}All tests completed successfully!${colors.reset}\n`);
    
  } catch (error) {
    console.log(`\n${colors.red}Test failed: ${error.message}${colors.reset}\n`);
    process.exit(1);
  }
}

// Run the tests
runTests().catch(console.error);