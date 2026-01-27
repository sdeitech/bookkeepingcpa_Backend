const crypto = require("crypto");
const ZapierJob = require("../models/zapierJob.model");
const { sendToZapier } = require("../services/zapier.services");

/**
 * 1️⃣ Create job + trigger Zapier
 */
exports.createZapierJob = async (req, res) => {
  try {
    const requestId = crypto.randomUUID();
    const payload = req.body;

    if(!payload || Object.keys(payload).length === 0) {
        return res.status(400).json({ message: "Payload is required" });
    }
    const user = await ZapierJob.findOne({
      'payload.email': payload.email,
      status: { $in: ['PENDING', 'SUCCESS'] }
    });
    
    if (user) {
      return res.status(409).json({
        message: "Request already exists for this email."
      });
    }
    
    const job=await ZapierJob.create({
      requestId,
      payload,
      status: "PENDING",
    });

    await sendToZapier({
      request_id: requestId,
      ...payload,
    });

    return res.status(202).json({
      id:job._id,
      requestId,
      status: "PENDING",
      message: "Zapier job triggered",
    });
  } catch (err) {
    return res.status(500).json({
      message: "Failed to trigger Zapier",
      error: err.message,
    });
  }
};

/**
 * 2️⃣ Zapier callback (SUCCESS / FAILED)
 */
exports.zapierStatusCallback = async (req, res) => {
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

  const job=await ZapierJob.findOneAndUpdate(
    { requestId: request_id },
    {
      status,
      "zapier.errorMessage": error,
      "zapier.errorStep": errorStep,
      "zapier.runId": run_id,
      "ignition.client_URL": client_URL,
    }
  );

  return res.status(200).json({ ok: true ,submittedAt:job.createdAt});
};

/**
 * 3️⃣ Get job status (Frontend / Admin)
 */
exports.getZapierJobStatus = async (req, res) => {
  const { requestId } = req.params;

  const job = await ZapierJob.findOne({ requestId });

  if (!job) {
    return res.status(404).json({ message: "Job not found" });
  }

  return res.status(200).json(job);
};
