const mongoose = require('mongoose');
const EngagementLetterSchema = new mongoose.Schema({
  email: { 
    type: String, 
    required: true,
    lowercase: true, // Normalize email
    trim: true,
  },
  documentId: { 
    type: String, 
    sparse: true, // Allows multiple null values
  },
  status: { 
    type: String, 
    enum: ["PROCESSING", "CREATED", "SENT", "CREATED_NOT_SENT", "FAILED","SIGNED"],
    required: true,
    index: true,
  },
  document_name: String,
  client_name: String,
  document_url: String,
  error: String,
  createdAt: { type: Date, default: Date.now },
  sentAt: Date,
  failedAt: Date,
  pandadocCreatedAt: Date,
});

// 🚨 CRITICAL: Partial unique index
// Only enforce uniqueness for active statuses
EngagementLetterSchema.index(
  { email: 1 },
  { 
    unique: true,
    partialFilterExpression: { 
      status: { $in: ["PROCESSING", "CREATED", "SENT"] } 
    },
    name: "unique_email_active_status"
  }
);

// Performance index
EngagementLetterSchema.index({ email: 1, status: 1 });

const EngagementLetter = mongoose.model('EngagementLetter', EngagementLetterSchema);
module.exports = EngagementLetter;

