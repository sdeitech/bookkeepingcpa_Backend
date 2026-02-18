const mongoose = require("mongoose");

const taskSchema = new mongoose.Schema(
    {
        title: { type: String, required: true, maxLength: 200, trim: true },
        description: { type: String, required: true, maxLength: 2000, trim: true },
        taskType: {
            type: String,
            enum: ['DOCUMENT_UPLOAD', 'INTEGRATION', 'ACTION', 'REVIEW'],
            required: true
            // DOCUMENT_UPLOAD: Client needs to upload specific documents
            // INTEGRATION: Client needs to connect a service (QuickBooks, Shopify)
            // ACTION: General action item (schedule call, update info)
            // REVIEW: Staff needs to review something (internal task)
        },
        // STATUS TRACKING
        status: {
            type: String,
            enum: ['NOT_STARTED', 'IN_PROGRESS', 'PENDING_REVIEW', 'NEEDS_REVISION', 'COMPLETED', 'CANCELLED'],
            default: 'NOT_STARTED',
            required: true
        },
        priority: {
            type: String,
            enum: ['HIGH', 'MEDIUM', 'LOW'],
            default: 'MEDIUM'
            // HIGH: Tax deadlines, urgent requests
            // MEDIUM: Regular workflow (default)
            // LOW: Nice-to-have, non-urgent
        },
        // ASSIGNMENT
        assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        assignedToRole: { type: String, enum: ['CLIENT', 'STAFF', 'ADMIN'], required: true },
        dueDate: { type: Date, required: true, index: true },
        completedAt: { type: Date, default: null },
        clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        staffId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
        templateId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'TaskTemplate',
            default: null,
            index: true
            // null = custom task (not from template)
        },
        templateName: {
            type: String,
            default: null,
            maxLength: 200
            // Stored for history/audit purposes
        },
        // For DOCUMENT_UPLOAD tasks - specific document type
        documentType: {
            type: String,
            default: null,
            maxLength: 200
            // e.g., "W-2 Forms", "Bank Statements", "Tax Return"
            // Makes filtering easier: "Show me all W-2 tasks"
        },
        // For ACTION tasks - client or staff action?
        actionCategory: {
            type: String,
            enum: ['CLIENT_ACTION', 'STAFF_ACTION'],
            default: null
            // CLIENT_ACTION = client needs to do it
            // STAFF_ACTION = internal staff work
            // Helps with filtering and notifications
        },
        // DOCUMENT UPLOAD (for DOCUMENT_UPLOAD type)
        documents: [{
            fileName: String,
            fileUrl: String,
            fileSize: Number,
            mimeType: String,
            uploadedAt: Date,
            uploadedBy: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User'
            }
        }],
        // INTEGRATION (for INTEGRATION type)
        integrationType: {
            type: String,
            enum: ['QUICKBOOKS', 'SHOPIFY', 'AMAZON'],
            default: null
            // Only used if taskType is INTEGRATION
        },
        integrationStatus: {
            type: String,
            default: null
            // 'CONNECTED', 'DISCONNECTED', 'ERROR'
        },
        integrationConnectedAt: {
            type: Date,
            default: null
        },
        // REVIEW & REJECTION
        reviewNotes: {
            type: String,
            maxLength: 1000,
            default: null
            // Staff's notes when reviewing
        },
        rejectionReason: {
            type: String,
            maxLength: 500,
            default: null
            // Why the task/document was rejected
        },
        reviewedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null
        },
        reviewedAt: {
            type: Date,
            default: null
        },
        // HELP REQUESTS
        helpRequests: [{
            requestedAt: {
                type: Date,
                default: Date.now
            },
            requestedBy: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User'
            },
            message: {
                type: String,
                maxLength: 500
            },
            resolvedAt: {
                type: Date,
                default: null
            },
            resolvedBy: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User',
                default: null
            }
        }],
        // HISTORY TRACKING
        statusHistory: [{
            status: String,
            changedBy: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User'
            },
            changedAt: {
                type: Date,
                default: Date.now
            },
            notes: String
        }],

        assignmentHistory: [{
            assignedTo: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User'
            },
            assignedBy: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User'
            },
            assignedAt: {
                type: Date,
                default: Date.now
            }
        }],
        // NOTIFICATION TRACKING (to avoid duplicate notifications)
        notifications: {
            dueSoonSent: { type: Boolean, default: false },
            lastOverdueReminderSent: { type: Date, default: null }
        }
    },
    { timestamps: true }
);
// INDEXES FOR PERFORMANCE
taskSchema.index({ clientId: 1, status: 1, dueDate: 1 });
taskSchema.index({ assignedTo: 1, status: 1, dueDate: 1 });
taskSchema.index({ staffId: 1, status: 1 });
taskSchema.index({ dueDate: 1, status: 1 });
taskSchema.index({ status: 1, priority: 1 });
taskSchema.index({ templateId: 1 }); // For template usage analytics
taskSchema.index({ documentType: 1 }); // For filtering by document type
taskSchema.index({ actionCategory: 1 }); // For filtering by action type

module.exports = mongoose.model("Task", taskSchema);