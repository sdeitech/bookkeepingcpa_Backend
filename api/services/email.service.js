const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs').promises;

class EmailService {
    constructor() {
        this.transporter = null;
        this.initializeTransporter();
    }

    /**
     * Initialize the email transporter with SMTP configuration
     */
    initializeTransporter() {
        try {
            // Create transporter with Gmail SMTP settings
            this.transporter = nodemailer.createTransport({
                service: 'gmail',
                host: process.env.SMTP_HOST || 'smtp.gmail.com',
                port: parseInt(process.env.SMTP_PORT) || 587,
                secure: false, // true for 465, false for other ports
                auth: {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASS // Use App Password for Gmail
                },
                tls: {
                    rejectUnauthorized: false
                }
            });

            // Verify transporter configuration
            this.verifyTransporter();
        } catch (error) {
            console.error('Error initializing email transporter:', error);
        }
    }

    /**
     * Verify SMTP connection
     */
    async verifyTransporter() {
        if (!this.transporter) {
            console.error('Email transporter not initialized');
            return false;
        }

        try {
            await this.transporter.verify();
            console.log('✅ Email service is ready to send emails');
            return true;
        } catch (error) {
            console.error('❌ Email service verification failed:', error.message);
            return false;
        }
    }

    /**
     * Load email template from file
     * @param {string} templateName - Name of the template file
     * @returns {object} - HTML and text content
     */
    async loadTemplate(templateName) {
        try {
            const templateDir = path.join(__dirname, '../../templates/emails');
            const htmlPath = path.join(templateDir, `${templateName}.html`);
            const textPath = path.join(templateDir, `${templateName}.txt`);

            let html = '';
            let text = '';

            // Try to load HTML template
            try {
                html = await fs.readFile(htmlPath, 'utf-8');
            } catch (err) {
                console.log(`HTML template not found: ${templateName}.html`);
            }

            // Try to load text template
            try {
                text = await fs.readFile(textPath, 'utf-8');
            } catch (err) {
                console.log(`Text template not found: ${templateName}.txt`);
            }

            return { html, text };
        } catch (error) {
            console.error('Error loading email template:', error);
            return { html: '', text: '' };
        }
    }

    /**
     * Replace template variables with actual values
     * @param {string} template - Template string
     * @param {object} variables - Variables to replace
     * @returns {string} - Processed template
     */
    processTemplate(template, variables) {
        let processedTemplate = template;
        
        Object.keys(variables).forEach(key => {
            const regex = new RegExp(`{{${key}}}`, 'g');
            processedTemplate = processedTemplate.replace(regex, variables[key]);
        });

        return processedTemplate;
    }

    /**
     * Send welcome email to new user
     * @param {object} userData - User information
     * @returns {object} - Result of email sending
     */
    async sendWelcomeEmail(userData) {
        try {
            if (!this.transporter) {
                throw new Error('Email transporter not initialized');
            }

            // Load email templates
            const { html, text } = await this.loadTemplate('welcome');

            // Prepare template variables
            const variables = {
                firstName: userData.first_name || 'User',
                lastName: userData.last_name || '',
                fullName: `${userData.first_name || ''} ${userData.last_name || ''}`.trim() || 'User',
                email: userData.email,
                loginUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
                supportEmail: process.env.SUPPORT_EMAIL || process.env.SMTP_USER,
                companyName: process.env.COMPANY_NAME || 'Bookkeeping CPA',
                currentYear: new Date().getFullYear()
            };

            // Process templates with variables
            const htmlContent = html ? this.processTemplate(html, variables) : this.getDefaultWelcomeHTML(variables);
            const textContent = text ? this.processTemplate(text, variables) : this.getDefaultWelcomeText(variables);

            // Email options
            const mailOptions = {
                from: `${process.env.COMPANY_NAME || 'Bookkeeping CPA'} <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
                to: userData.email,
                subject: `Welcome to ${process.env.COMPANY_NAME || 'Bookkeeping CPA'}, ${userData.first_name}!`,
                html: htmlContent,
                text: textContent
            };

            // Send email
            const result = await this.transporter.sendMail(mailOptions);
            
            console.log('✅ Welcome email sent successfully to:', userData.email);
            return {
                success: true,
                messageId: result.messageId,
                accepted: result.accepted
            };

        } catch (error) {
            console.error('❌ Error sending welcome email:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Send password reset email
     * @param {object} userData - User information
     * @param {string} resetToken - Password reset token
     * @returns {object} - Result of email sending
     */
    async sendPasswordResetEmail(userData, resetToken) {
        try {
            if (!this.transporter) {
                throw new Error('Email transporter not initialized');
            }

            const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
            
            const mailOptions = {
                from: `${process.env.COMPANY_NAME || 'Bookkeeping CPA'} <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
                to: userData.email,
                subject: 'Password Reset Request',
                html: this.getPasswordResetHTML({ ...userData, resetUrl }),
                text: this.getPasswordResetText({ ...userData, resetUrl })
            };

            const result = await this.transporter.sendMail(mailOptions);
            
            console.log('✅ Password reset email sent to:', userData.email);
            return {
                success: true,
                messageId: result.messageId
            };

        } catch (error) {
            console.error('❌ Error sending password reset email:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Send generic email
     * @param {object} emailData - Email data (to, subject, html, text)
     * @returns {object} - Result of email sending
     */
    async sendEmail(emailData) {
        try {
            if (!this.transporter) {
                throw new Error('Email transporter not initialized');
            }

            const mailOptions = {
                from: emailData.from || `${process.env.COMPANY_NAME || 'Bookkeeping CPA'} <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
                to: emailData.to,
                subject: emailData.subject,
                html: emailData.html,
                text: emailData.text
            };

            // Add CC if provided
            if (emailData.cc) {
                mailOptions.cc = emailData.cc;
            }

            // Add BCC if provided
            if (emailData.bcc) {
                mailOptions.bcc = emailData.bcc;
            }

            // Add attachments if provided
            if (emailData.attachments) {
                mailOptions.attachments = emailData.attachments;
            }

            const result = await this.transporter.sendMail(mailOptions);
            
            console.log('✅ Email sent successfully to:', emailData.to);
            return {
                success: true,
                messageId: result.messageId,
                accepted: result.accepted
            };

        } catch (error) {
            console.error('❌ Error sending email:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Default welcome email HTML template
     */
    getDefaultWelcomeHTML(variables) {
        return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Welcome to ${variables.companyName}</title>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
                .button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
                .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
                h1 { margin: 0; }
                .features { background: white; padding: 20px; margin: 20px 0; border-radius: 5px; }
                .feature { margin: 15px 0; padding-left: 25px; position: relative; }
                .feature:before { content: "✓"; position: absolute; left: 0; color: #667eea; font-weight: bold; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>Welcome to ${variables.companyName}!</h1>
                </div>
                <div class="content">
                    <h2>Hello ${variables.firstName}! 👋</h2>
                    <p>Thank you for joining ${variables.companyName}. We're excited to have you on board!</p>
                    
                    <p>Your account has been successfully created with the email address: <strong>${variables.email}</strong></p>
                    
                    <div class="features">
                        <h3>What you can do now:</h3>
                        <div class="feature">Complete your profile information</div>
                        <div class="feature">Explore our bookkeeping services</div>
                        <div class="feature">Connect with our support team</div>
                        <div class="feature">Access your dashboard</div>
                    </div>
                    
                    <center>
                        <a href="${variables.loginUrl}" class="button">Go to Dashboard</a>
                    </center>
                    
                    <p>If you have any questions or need assistance, don't hesitate to reach out to our support team at <a href="mailto:${variables.supportEmail}">${variables.supportEmail}</a></p>
                    
                    <p>Best regards,<br>The ${variables.companyName} Team</p>
                </div>
                <div class="footer">
                    <p>&copy; ${variables.currentYear} ${variables.companyName}. All rights reserved.</p>
                    <p>This email was sent to ${variables.email} because you signed up for an account.</p>
                </div>
            </div>
        </body>
        </html>
        `;
    }

    /**
     * Default welcome email text template
     */
    getDefaultWelcomeText(variables) {
        return `
Welcome to ${variables.companyName}!

Hello ${variables.firstName}!

Thank you for joining ${variables.companyName}. We're excited to have you on board!

Your account has been successfully created with the email address: ${variables.email}

What you can do now:
- Complete your profile information
- Explore our bookkeeping services
- Connect with our support team
- Access your dashboard

Visit your dashboard: ${variables.loginUrl}

If you have any questions or need assistance, don't hesitate to reach out to our support team at ${variables.supportEmail}

Best regards,
The ${variables.companyName} Team

© ${variables.currentYear} ${variables.companyName}. All rights reserved.
This email was sent to ${variables.email} because you signed up for an account.
        `;
    }

    /**
     * Password reset email HTML template
     */
    getPasswordResetHTML(variables) {
        return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Password Reset Request</title>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: #f44336; color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
                .button { display: inline-block; background: #f44336; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
                .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>Password Reset Request</h1>
                </div>
                <div class="content">
                    <p>Hello ${variables.first_name},</p>
                    <p>We received a request to reset your password. Click the button below to create a new password:</p>
                    <center>
                        <a href="${variables.resetUrl}" class="button">Reset Password</a>
                    </center>
                    <p>This link will expire in 1 hour for security reasons.</p>
                    <p>If you didn't request this, please ignore this email.</p>
                </div>
                <div class="footer">
                    <p>&copy; ${new Date().getFullYear()} ${process.env.COMPANY_NAME || 'Bookkeeping CPA'}. All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>
        `;
    }

    /**
     * Password reset email text template
     */
    getPasswordResetText(variables) {
        return `
Password Reset Request

Hello ${variables.first_name},

We received a request to reset your password. Click the link below to create a new password:

${variables.resetUrl}

This link will expire in 1 hour for security reasons.

If you didn't request this, please ignore this email.

© ${new Date().getFullYear()} ${process.env.COMPANY_NAME || 'Bookkeeping CPA'}. All rights reserved.
        `;
    }
}

// Export singleton instance
module.exports = new EmailService();