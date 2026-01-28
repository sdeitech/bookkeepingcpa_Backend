const mongoose = require("mongoose");

const zapierJobSchema = new mongoose.Schema(
    {
        requestId: {
            type: String,
            required: true,
            unique: true,
            index: true,
        },

        payload: {
            type: Object,
            required: true,
        },

        status: {
            type: String,
            enum: ["PENDING", "SUCCESS", "FAILED", "TIMEOUT"],
            default: "PENDING",
            index: true,
        },

        zapier: {
            errorStep: String,
            errorMessage: String,
            runId: String,
        },

        ignition: {
            client_URL: String,
        },

        retryCount: {
            type: Number,
            default: 0,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model("ZapierJob", zapierJobSchema);
