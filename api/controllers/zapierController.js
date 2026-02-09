const axios = require('axios');
const QuestionnaireResponse = require('../models/questionnaireResponse.model');
const crypto = require('crypto');
const ZapierJob = require('../models/zapierJob.model');
const emailService = require('../services/email.service');
const User = require('../models/userModel');
const bcryptService = require('../services/bcrypt.services');

/**
 * Format questionnaire data for Zapier webhook
 * Zapier expects data in a specific format for "Create Client" action in Ignition
 * 
 * @param {Object} questionnaireData - Questionnaire response data
 * @returns {Object} Formatted data for Zapier
 */
const formatDataForZapier = (questionnaireData) => {
    const { email, name, answers, recommendedPlan } = questionnaireData;


    // Format for Zapier "Create Client" action in Ignition
    // Based on Ignition's client creation requirements:
    // - Client Name (required)
    // - Contact Name (required)
    // - Contact Email (required)
    // - Additional fields can be passed as custom fields

    return {
        // Required fields for Ignition client creation
        'Client Name': name || email.split('@')[0], // Use name or email prefix as fallback
        'Contact Name': name,
        'Contact Email': email,

        // Plan information
        'Plan Type': recommendedPlan,
        'Recommended Plan': recommendedPlan.charAt(0).toUpperCase() + recommendedPlan.slice(1), // Capitalize

        // Questionnaire answers as metadata (for reference)
        'Questionnaire Answers': {
            'Revenue': answers.q1Revenue,
            'Support Level': answers.q2Support,
            'Customization': answers.q3Customization,
            'Business Structure': answers.q4Structure,
            'Cleanup Required': answers.q5Cleanup,
            'Tax Assistance': answers.q6Tax
        },

        // Additional metadata
        'Source': 'Website Questionnaire',
        'Submitted At': new Date().toISOString()
    };
};

/**
 * Send Enterprise consultation emails (user + admin)
 * This is fire-and-forget; errors are logged but do not break the main flow.
 *
 * @param {Object} questionnaireData - { email, name, answers, recommendedPlan }
 * @param {Object} options - { ignitionClientLink, submittedAt }
 */
async function sendEnterpriseEmails(questionnaireData, options = {}) {
    try {
        const { email, name, answers, recommendedPlan } = questionnaireData;
        if (!email || !name || recommendedPlan !== 'enterprise') {
            return;
        }

        const companyName = process.env.COMPANY_NAME || 'Bookkeeping CPA';
        const supportEmail = process.env.SUPPORT_EMAIL || process.env.SMTP_FROM || process.env.SMTP_USER;
        const submittedAt = options.submittedAt || new Date().toISOString();
        const ignitionClientLink = options.ignitionClientLink || '';

        // Map raw codes to something slightly more readable (best‑effort, safe for demo)
        const codeOr = (val, fallback) => val || fallback;
        const revenue = codeOr(answers?.q1Revenue, 'N/A');
        const supportLevel = codeOr(answers?.q2Support, 'N/A');
        const customization = codeOr(answers?.q3Customization, 'N/A');
        const businessStructure = codeOr(answers?.q4Structure, 'N/A');
        const cleanup = codeOr(answers?.q5Cleanup, 'N/A');
        const tax = codeOr(answers?.q6Tax, 'N/A');

        const planName = 'Enterprise';

        // --- User confirmation email (simple HTML/text for now) ---
        const userSubject = `Your ${planName} consultation request with ${companyName}`;
        const userHtml = `
      <p>Hi ${name},</p>
      <p>Thank you for requesting an <strong>${planName}</strong> consultation with <strong>${companyName}</strong>.</p>
      <p>We’ve received your details and our team will review your information before the call.</p>
      <p>You will also receive a separate email/calendar invite from our scheduling system with the meeting details.</p>
      <p>If you have any questions before the call, you can reply to this email or contact us at <a href="mailto:${supportEmail}">${supportEmail}</a>.</p>
      <p>Best regards,<br/>The ${companyName} Team</p>
    `;
        const userText = `
Hi ${name},

Thank you for requesting an ${planName} consultation with ${companyName}.

We’ve received your details and our team will review your information before the call.

You will also receive a separate email/calendar invite with the meeting details.

If you have any questions before the call, reply to this email or contact us at ${supportEmail}.

Best regards,
The ${companyName} Team
    `.trim();

        await emailService.sendEmail({
            to: email,
            subject: userSubject,
            html: userHtml,
            text: userText,
        });

        // --- Admin notification email ---
        const adminTo =
            process.env.ADMIN_EMAIL || supportEmail || process.env.SMTP_USER;
        const adminSubject = `New Enterprise consultation request - ${name}`;
        const adminHtml = `
      <p><strong>New Enterprise consultation request received.</strong></p>
      <p><strong>Client:</strong> ${name} &lt;${email}&gt;</p>
      <p><strong>Plan:</strong> ${planName}</p>
      <p><strong>Submitted at:</strong> ${submittedAt}</p>
      <h4>Questionnaire summary</h4>
      <ul>
        <li>Revenue: ${revenue}</li>
        <li>Support Level: ${supportLevel}</li>
        <li>Customization Needed: ${customization}</li>
        <li>Business Structure: ${businessStructure}</li>
        <li>Cleanup Required: ${cleanup}</li>
        <li>Tax Assistance: ${tax}</li>
      </ul>
      ${ignitionClientLink
                ? `<p><strong>Ignition client record:</strong> <a href="${ignitionClientLink}" target="_blank" rel="noopener noreferrer">${ignitionClientLink}</a></p>`
                : ''
            }
      <p>Please review the client’s details and follow up from Ignition.</p>
    `;
        const adminText = `
New Enterprise consultation request received.

Client: ${name} <${email}>
Plan: ${planName}
Submitted at: ${submittedAt}

Questionnaire summary:
- Revenue: ${revenue}
- Support Level: ${supportLevel}
- Customization Needed: ${customization}
- Business Structure: ${businessStructure}
- Cleanup Required: ${cleanup}
- Tax Assistance: ${tax}
${ignitionClientLink ? `Ignition client record: ${ignitionClientLink}` : ''}

Please review the client’s details and follow up from Ignition.
    `.trim();

        await emailService.sendEmail({
            to: adminTo,
            subject: adminSubject,
            html: adminHtml,
            text: adminText,
        });
    } catch (err) {
        console.error('Error sending Enterprise consultation emails:', err);
    }
}

/**
 * Create client in Ignition via Zapier webhook
 * POST /api/integrations/zapier/lead
 * 
 * Body:
 * - questionnaireId: String (MongoDB ObjectId) - Optional, if provided fetches from DB
 * - OR direct data: { email, name, answers, recommendedPlan }
 * 
 * Headers:
 * - Authorization: Bearer <ZAPIER_WEBHOOK_SECRET> (optional, for security)
 */
const createClientInIgnition = async (req, res) => {
    try {
        const { questionnaireId, email, name, answers, recommendedPlan } = req.body;
        console.log("Create Client Request Body:", req.body);
        const requestId = crypto.randomUUID();
        const user = await ZapierJob.findOne({
            "payload.Contact Email": email,
            status: { $in: ['PENDING', 'SUCCESS'] }
        });

        if (user) {
            return res.status(409).json({
                message: "Request already exists for this email."
            });
        }


        let questionnaireData;

        // If questionnaireId is provided, fetch from database
        if (questionnaireId) {
            questionnaireData = await QuestionnaireResponse.findById(questionnaireId);

            if (!questionnaireData) {
                return res.status(404).json({
                    success: false,
                    error: 'Not found',
                    message: 'Questionnaire response not found'
                });
            }
        } else if (email && name && answers && recommendedPlan) {
            // Use provided data directly
            questionnaireData = {
                email,
                name,
                answers,
                recommendedPlan
            };
        } else {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields',
                message: 'Either questionnaireId or (email, name, answers, recommendedPlan) are required'
            });
        }

        // Get Zapier webhook URL from environment
        const zapierWebhookUrl = process.env.ZAPIER_WEBHOOK_URL;

        if (!zapierWebhookUrl) {
            console.warn('⚠️ ZAPIER_WEBHOOK_URL not configured. Skipping Zapier webhook call.');

            // In development, return success without calling Zapier
            if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'dev') {
                return res.status(200).json({
                    success: true,
                    message: 'Questionnaire processed (Zapier webhook not configured)',
                    data: {
                        zapierCalled: false,
                        reason: 'ZAPIER_WEBHOOK_URL not configured',
                        formattedData: formatDataForZapier(questionnaireData)
                    }
                });
            }

            return res.status(500).json({
                success: false,
                error: 'Configuration error',
                message: 'Zapier webhook URL is not configured'
            });
        }

        // Format data for Zapier
        const formatedData = formatDataForZapier(questionnaireData);
        const zapierData = {
            ...formatedData,
            requestId,
        };
        const job = await ZapierJob.create({
            requestId,
            payload: zapierData,
            status: 'PENDING',
        });

        // Call Zapier webhook
        let zapierResponse;
        try {
            const response = await axios.post(zapierWebhookUrl, zapierData, {
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'Plutify-Backend/1.0'
                },
                timeout: 10000 // 10 second timeout
            });

            zapierResponse = {
                success: true,
                status: response.status,
                data: response.data,
            };

            console.log('✅ Zapier webhook called successfully:', {
                status: response.status,
                clientName: zapierData['Client Name']
            });

        } catch (zapierError) {
            console.error('❌ Zapier webhook error:', {
                message: zapierError.message,
                status: zapierError.response?.status,
                data: zapierError.response?.data
            });

            // Don't fail the entire request if Zapier fails
            // Log the error but still return success
            zapierResponse = {
                success: false,
                error: zapierError.message,
                status: zapierError.response?.status || 500,
                data: zapierError.response?.data || null
            };
        }

        // Update questionnaire status if questionnaireId was provided
        if (questionnaireId) {
            try {
                await QuestionnaireResponse.findByIdAndUpdate(
                    questionnaireId,
                    {
                        status: zapierResponse.success ? 'proposal_sent' : 'pending',
                        'metadata.ignitionClientId': zapierResponse.data?.id || null
                    },
                    { new: true }
                );
            } catch (updateError) {
                console.error('Error updating questionnaire status:', updateError);
                // Don't fail the request if update fails
            }
        }

        // Fire-and-forget emails for Enterprise consultations
        if (questionnaireData.recommendedPlan === 'enterprise') {
            // best-effort, don't await in the main response chain
            void sendEnterpriseEmails(questionnaireData, {
                submittedAt: questionnaireData.createdAt || new Date().toISOString(),
                ignitionClientLink: job?.ignition?.client_URL || '',
            });
        }

        // Return success response
        return res.status(200).json({
            success: true,
            message: 'Client creation request sent to Ignition via Zapier',
            data: {
                zapierCalled: true,
                zapierResponse: zapierResponse,
                formattedData: zapierData,
            },
        });

    } catch (error) {
        console.error('Error creating client in Ignition:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to create client in Ignition',
            message: error.message || 'An unexpected error occurred'
        });
    }
};

/**
 * Test Zapier webhook endpoint (for development)
 * POST /api/integrations/zapier/test
 */
const testZapierWebhook = async (req, res) => {
    try {
        const zapierWebhookUrl = process.env.ZAPIER_WEBHOOK_URL;

        if (!zapierWebhookUrl) {
            return res.status(400).json({
                success: false,
                error: 'Configuration error',
                message: 'ZAPIER_WEBHOOK_URL is not configured'
            });
        }

        // Test data
        const testData = {
            'Client Name': 'Test Client',
            'Contact Name': 'Test User',
            'Contact Email': 'test@example.com',
            'Plan Type': 'startup',
            'Recommended Plan': 'Startup',
            'Source': 'Test Webhook',
            'Submitted At': new Date().toISOString()
        };

        // Call Zapier webhook
        const response = await axios.post(zapierWebhookUrl, testData, {
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Plutify-Backend/1.0'
            },
            timeout: 10000
        });

        return res.status(200).json({
            success: true,
            message: 'Test webhook called successfully',
            data: {
                status: response.status,
                response: response.data,
                sentData: testData
            }
        });

    } catch (error) {
        console.error('Test webhook error:', error);
        return res.status(500).json({
            success: false,
            error: 'Test webhook failed',
            message: error.message,
            details: error.response?.data || null
        });
    }
};

const zapierStatusCallback = async (req, res) => {
    try {
        const {
            request_id,
            status,
            error,
            errorStep,
            client_URL,
            run_id,
        } = req.body;
        console.log("Zapier Callback Received:", req.body);

        if (!request_id || !status) {
            return res.status(400).json({ message: "Invalid callback payload" });
        }

        const job = await ZapierJob.findOneAndUpdate(
            { requestId: request_id },
            {
                status,
                "zapier.errorMessage": error,
                "zapier.errorStep": errorStep,
                "zapier.runId": run_id,
                "ignition.client_URL": client_URL,
            }
        );

        return res.status(200).json({ ok: true, submittedAt: job.createdAt });
    } catch (err) {
        console.error("Error handling Zapier status callback:", err);
        return res.status(500).json({
            message: "Internal server error",
            error: err.message || "An unexpected error occurred",
        });
    }
};

/**
 * Onboard a client from a QuestionnaireResponse:
 * - Create a User (role 3 - Client) if one doesn't already exist
 * - Link questionnaire.userId
 * - Mark questionnaire.status = 'onboarded'
 * - Send welcome email with generated password
 */
async function onboardClientFromQuestionnaire(questionnaire) {
    if (!questionnaire || !questionnaire.email) {
        return null;
    }

    const email = questionnaire.email.toLowerCase();

    // If already linked to a user and marked onboarded, do nothing
    if (questionnaire.userId && questionnaire.status === 'onboarded') {
        return { userId: questionnaire.userId, alreadyOnboarded: true };
    }

    // Try to find existing user by email
    let user = await User.findOne({ email });

    let plainPassword = null;

    if (!user) {
        // Derive first/last name from questionnaire.name (best-effort)
        const fullName = questionnaire.name || '';
        const nameParts = fullName.trim().split(' ').filter(Boolean);
        const first_name = nameParts[0] || '';
        const last_name = nameParts.slice(1).join(' ') || '';

        // Generate a secure random password
        plainPassword = crypto.randomBytes(10).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 12);
        const passwordHash = await bcryptService.generatePassword(plainPassword);

        user = await User.create({
            email,
            password: passwordHash,
            first_name,
            last_name,
            role_id: '3', // Client
            active: true,
        });
    }

    // Link questionnaire to user and mark as onboarded
    questionnaire.userId = user._id;
    questionnaire.status = 'onboarded';
    await questionnaire.save();

    // Send welcome email with credentials
    try {
        const companyName = process.env.COMPANY_NAME || 'Bookkeeping CPA';
        const loginUrl = process.env.FRONTEND_URL || 'http://localhost:4000';
        const supportEmail =
            process.env.SUPPORT_EMAIL || process.env.SMTP_FROM || process.env.SMTP_USER || user.email;

        const subject = `Your ${companyName} account is ready`;
        const html = `
      <p>Hi ${user.first_name || questionnaire.name || ''},</p>
      <p>Your client account with <strong>${companyName}</strong> has been created.</p>
      <p>You can log in using the following credentials:</p>
      <ul>
        <li><strong>Email:</strong> ${user.email}</li>
        ${plainPassword ? `<li><strong>Temporary Password:</strong> ${plainPassword}</li>` : ''}
      </ul>
      <p>Please log in and change your password as soon as possible:</p>
      <p><a href="${loginUrl}" target="_blank" rel="noopener noreferrer">${loginUrl}</a></p>
      <p>If you have any questions or need help, contact us at <a href="mailto:${supportEmail}">${supportEmail}</a>.</p>
      <p>Best regards,<br/>The ${companyName} Team</p>
    `;

        const text = `
Hi ${user.first_name || questionnaire.name || ''},

Your client account with ${companyName} has been created.

You can log in using the following credentials:
- Email: ${user.email}
${plainPassword ? `- Temporary Password: ${plainPassword}` : ''}

Please log in and change your password as soon as possible:
${loginUrl}

If you have any questions or need help, contact us at ${supportEmail}.

Best regards,
The ${companyName} Team
    `.trim();

        await emailService.sendEmail({
            to: user.email,
            subject,
            html,
            text,
        });
    } catch (err) {
        console.error('Error sending onboarding welcome email:', err);
        // Non-fatal: user is still created and linked
    }

    return {
        userId: user._id,
        email: user.email,
    };
}

/**
 * Ignition/Zapier callback for proposal/payment status.
 * This is called from Zapier when Ignition reports that a proposal
 * has been accepted and (optionally) paid.
 *
 * POST /api/integrations/ignition/proposal-status
 *
 * Expected body (from Zap):
 * {
 *   email: string,
 *   proposal_status: string,
 *   payment_status: string,
 *   proposal_id: string,
 *   paid_at?: string (ISO date)
 * }
 */
const ignitionProposalStatusCallback = async (req, res) => {
    try {
        const {
            email,
            proposal_status,
            payment_status,
            proposal_id,
            paid_at,
        } = req.body || {};

        console.log('Ignition proposal status callback received:', req.body);

        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'Missing required field: email',
            });
        }

        // Find the most recent questionnaire for this email
        const questionnaire = await QuestionnaireResponse.findOne({ email })
            .sort({ createdAt: -1 })
            .exec();

        if (!questionnaire) {
            return res.status(404).json({
                success: false,
                message: 'Questionnaire response not found for provided email',
            });
        }

        // Update questionnaire status & metadata based on Ignition/Zap payload
        // For now we simply mark as "signed" or "onboarded" depending on payment_status.
        const updates = {};

        if (proposal_id) {
            updates['metadata.ignitionClientId'] = proposal_id;
        }

        // If payment is confirmed, set paidAt and move towards onboarded
        const isPaid =
            typeof payment_status === 'string' &&
            ['paid', 'completed', 'succeeded'].includes(payment_status.toLowerCase());

        if (isPaid) {
            updates.paidAt = paid_at ? new Date(paid_at) : new Date();

            // Only bump status forward, don't regress
            if (questionnaire.status === 'pending' || questionnaire.status === 'proposal_sent') {
                updates.status = 'signed';
            }
        } else if (proposal_status && questionnaire.status === 'pending') {
            // If only proposal is accepted but we don't have payment yet,
            // we can still move from pending -> signed.
            const lower = proposal_status.toLowerCase();
            if (['accepted', 'active', 'signed'].includes(lower)) {
                updates.status = 'signed';
            }
        }

        if (Object.keys(updates).length === 0) {
            // Nothing to update; still return OK for Zapier
            return res.status(200).json({
                success: true,
                message: 'No status change required for questionnaire',
            });
        }

        const updated = await QuestionnaireResponse.findByIdAndUpdate(
            questionnaire._id,
            { $set: updates },
            { new: true }
        );

        // If payment is confirmed, attempt onboarding (create User + link questionnaire)
        let onboardingResult = null;
        if (
            isPaid &&
            (!updated.userId || updated.status !== 'onboarded')
        ) {
            try {
                onboardingResult = await onboardClientFromQuestionnaire(updated);
            } catch (onboardErr) {
                console.error('Error during onboarding from Ignition status:', onboardErr);
            }
        }

        return res.status(200).json({
            success: true,
            message: 'Questionnaire updated from Ignition status',
            data: {
                id: updated._id,
                email: updated.email,
                status: updated.status,
                paidAt: updated.paidAt,
                metadata: updated.metadata,
                onboarding: onboardingResult,
            },
        });
    } catch (err) {
        console.error('Error handling Ignition proposal status callback:', err);
        return res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: err.message || 'An unexpected error occurred',
        });
    }
};

module.exports = {
    createClientInIgnition,
    testZapierWebhook,
    formatDataForZapier, // Export for testing,
    zapierStatusCallback,
    ignitionProposalStatusCallback,
};
