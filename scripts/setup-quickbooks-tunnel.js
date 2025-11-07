#!/usr/bin/env node

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

console.log('🚀 Setting up QuickBooks OAuth tunnel for local development...\n');

// Check if ngrok is installed
exec('ngrok version', (error) => {
  if (error) {
    console.error('❌ ngrok is not installed. Installing...');
    exec('npm install -g ngrok', (installError) => {
      if (installError) {
        console.error('Failed to install ngrok. Please install manually:');
        console.log('npm install -g ngrok');
        process.exit(1);
      }
      startTunnel();
    });
  } else {
    startTunnel();
  }
});

function startTunnel() {
  const port = process.env.PORT || 8080;
  
  console.log(`📡 Starting ngrok tunnel on port ${port}...`);
  
  const ngrok = exec(`ngrok http ${port}`, (error, stdout, stderr) => {
    if (error) {
      console.error(`Error starting ngrok: ${error}`);
      return;
    }
  });

  // Give ngrok time to start
  setTimeout(() => {
    // Get tunnel URL
    exec('curl -s http://localhost:4040/api/tunnels', (error, stdout) => {
      if (error) {
        console.error('❌ Could not get tunnel URL. Make sure ngrok is running.');
        console.log('\nTo manually start ngrok, run:');
        console.log(`ngrok http ${port}`);
        return;
      }

      try {
        const tunnels = JSON.parse(stdout);
        const httpsTunnel = tunnels.tunnels.find(t => t.proto === 'https');
        
        if (httpsTunnel) {
          const tunnelUrl = httpsTunnel.public_url;
          console.log('\n✅ Ngrok tunnel established!');
          console.log(`🌐 Public URL: ${tunnelUrl}`);
          console.log('\n📋 Next steps:');
          console.log('1. Update your .env file:');
          console.log(`   QUICKBOOKS_REDIRECT_URI=${tunnelUrl}/api/quickbooks/auth/callback`);
          console.log('\n2. Add this URL to your QuickBooks app redirect URIs:');
          console.log(`   ${tunnelUrl}/api/quickbooks/auth/callback`);
          console.log('\n3. Restart your backend server after updating .env');
          console.log('\n⚠️  Note: This ngrok URL will change each time you restart ngrok');
          
          // Optionally update .env file automatically
          const envPath = path.join(__dirname, '..', '.env');
          if (fs.existsSync(envPath)) {
            console.log('\n🔧 Would you like to automatically update your .env file? (Manual update recommended)');
          }
        } else {
          console.error('❌ Could not find HTTPS tunnel');
        }
      } catch (parseError) {
        console.error('❌ Error parsing tunnel information');
        console.log('Please check ngrok dashboard at http://localhost:4040');
      }
    });
  }, 3000);
}

console.log('\n📌 Press Ctrl+C to stop the tunnel\n');