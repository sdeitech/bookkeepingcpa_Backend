const axios = require('axios');
const QuestionnaireResponse = require('../models/questionnaireResponse.model');
const crypto = require("crypto");
const ZapierJob = require("../models/zapierJob.model");

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
        const requestId = crypto.randomUUID();
        const user = await ZapierJob.findOne({
            'email': email,
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
            status: "PENDING",

        };
        const job = await ZapierJob.create({
            requestId,
            payload: zapierData,
            status: "PENDING",
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

        // Return success response
        return res.status(200).json({
            success: true,
            message: 'Client creation request sent to Ignition via Zapier',
            data: {
                zapierCalled: true,
                zapierResponse: zapierResponse,
                formattedData: zapierData,
            }
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

module.exports = {
    createClientInIgnition,
    testZapierWebhook,
    formatDataForZapier, // Export for testing,
    zapierStatusCallback
};
