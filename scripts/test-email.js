/**
 * Test script for email functionality
 * Run this script to test if your email configuration is working correctly
 * 
 * Usage: node scripts/test-email.js
 */

require('dotenv').config({ path: `.env.${process.env.NODE_ENV || 'dev'}` });
const emailService = require('../api/services/email.service');

// Test email configuration
const testEmail = async () => {
    console.log('======================================');
    console.log('Email Configuration Test');
    console.log('======================================');
    console.log('');
    
    // Display current configuration (hide sensitive data)
    console.log('📧 Email Configuration:');
    console.log('   Host:', process.env.SMTP_HOST || 'Not configured');
    console.log('   Port:', process.env.SMTP_PORT || 'Not configured');
    console.log('   User:', process.env.SMTP_USER ? '✓ Configured' : '✗ Not configured');
    console.log('   Pass:', process.env.SMTP_PASS ? '✓ Configured' : '✗ Not configured');
    console.log('   From:', process.env.SMTP_FROM || 'Not configured');
    console.log('   Company:', process.env.COMPANY_NAME || 'Not configured');
    console.log('');
    
    // Check if required environment variables are set
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
        console.error('❌ Error: Email configuration is incomplete!');
        console.error('');
        console.error('Please set the following environment variables in your .env file:');
        console.error('   SMTP_USER=your-email@gmail.com');
        console.error('   SMTP_PASS=your-app-password');
        console.error('');
        console.error('For Gmail:');
        console.error('   1. Enable 2-factor authentication in your Google account');
        console.error('   2. Go to: https://myaccount.google.com/apppasswords');
        console.error('   3. Generate an app password for "Mail"');
        console.error('   4. Use that password as SMTP_PASS');
        process.exit(1);
    }
    
    // Wait a moment for the email service to initialize
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Verify transporter
    console.log('🔍 Verifying email transporter...');
    const isValid = await emailService.verifyTransporter();
    
    if (!isValid) {
        console.error('❌ Email transporter verification failed!');
        console.error('   Please check your email configuration.');
        process.exit(1);
    }
    
    console.log('');
    console.log('======================================');
    console.log('Sending Test Welcome Email');
    console.log('======================================');
    
    // Test user data
    const testUser = {
        first_name: 'Test',
        last_name: 'User',
        email: process.env.SMTP_USER // Send to yourself for testing
    };
    
    console.log('📮 Sending welcome email to:', testUser.email);
    console.log('');
    
    // Send test email
    const result = await emailService.sendWelcomeEmail(testUser);
    
    if (result.success) {
        console.log('✅ Test email sent successfully!');
        console.log('   Message ID:', result.messageId);
        console.log('   Accepted:', result.accepted);
        console.log('');
        console.log('📬 Please check your inbox for the welcome email.');
        console.log('   Note: It might take a few moments to arrive.');
        console.log('   Also check your spam/junk folder if you don\'t see it.');
    } else {
        console.error('❌ Failed to send test email!');
        console.error('   Error:', result.error);
        console.error('');
        console.error('Common issues:');
        console.error('   1. Wrong email or password');
        console.error('   2. Less secure app access is disabled (for Gmail)');
        console.error('   3. 2-factor authentication is enabled but not using app password');
        console.error('   4. Network/firewall blocking SMTP port');
    }
    
    console.log('');
    console.log('======================================');
    console.log('Test Complete');
    console.log('======================================');
    
    // Test generic email functionality
    console.log('');
    console.log('Testing generic email functionality...');
    
    const genericResult = await emailService.sendEmail({
        to: process.env.SMTP_USER,
        subject: 'Test Email from Bookkeeping CPA',
        html: '<h1>Test Email</h1><p>This is a test email from your Bookkeeping CPA application.</p>',
        text: 'Test Email\n\nThis is a test email from your Bookkeeping CPA application.'
    });
    
    if (genericResult.success) {
        console.log('✅ Generic email test successful!');
    } else {
        console.log('❌ Generic email test failed:', genericResult.error);
    }
    
    process.exit(0);
};

// Run the test
testEmail().catch(error => {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
});