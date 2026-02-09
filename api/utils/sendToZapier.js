const axios = require("axios");
const crypto = require("crypto");
const ZapierJob = require("../models/zapierJob.model");

const sendToZapier = async ({ payload, type }) => {
  const zapierWebhookUrl = process.env.ZAPIER_WEBHOOK_URL;

  if (!zapierWebhookUrl) {
    throw new Error("ZAPIER_WEBHOOK_URL not configured");
  }

  const requestId = crypto.randomUUID();

  // Prevent duplicate requests (email-based)
  if (payload.client_email || payload.email) {
    const email = payload.client_email || payload.email;

    const existingJob = await ZapierJob.findOne({
      "payload.client_email": email,
      status: { $in: ["PENDING", "SUCCESS"] },
    });

    if (existingJob) {
      const error = new Error("Request already exists for this email.");
      error.statusCode = 409;
      throw error;
    }
  }

  // Save job
  const job = await ZapierJob.create({
    requestId,
    type, // IGNITION | PANDADOC
    payload,
    status: "PENDING",
  });

  try {
    const response = await axios.post(zapierWebhookUrl, {
      ...payload,
      requestId,
      type,
    }, {
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Plutify-Backend/1.0",
      },
      timeout: 10000,
    });

    job.status = "PENDING";
    job.response = response.data;
    await job.save();

    return {
      success: true,
      requestId,
      response: response.data,
    };

  } catch (error) {
    job.status = "FAILED";
    job.error = error.message;
    await job.save();

    return {
      success: false,
      requestId,
      error: error.message,
    };
  }
};

module.exports = { sendToZapier };
