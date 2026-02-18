const mongoose = require("mongoose");

const taskTemplateSchema = new mongoose.Schema(
    {
        // BASIC INFO
        name: { 
            type: String, 
            required: true,
            maxLength: 200,
            trim: true
        },
        
        description: { 
            type: String, 
            maxLength: 1000,
            trim: true
        },
        
        // CATEGORIZATION
        category: {
            type: String,
            enum: ['DOCUMENT_UPLOAD', 'INTEGRATION', 'ACTION', 'REVIEW'],
            required: true
            // Used for grouping templates in UI
        },
        
        taskType: {
            type: String,
            enum: ['DOCUMENT_UPLOAD', 'INTEGRATION', 'ACTION', 'REVIEW'],
            required: true
            // Same as category, kept for consistency with Task model
        },
        
        // TYPE-SPECIFIC FIELDS
        
        // For DOCUMENT_UPLOAD tasks
        documentType: {
            type: String,
            default: null
            // e.g., "W-2 Forms", "Bank Statements", "Tax Return"
        },
        
        // For INTEGRATION tasks
        integrationType: {
            type: String,
            enum: ['QUICKBOOKS', 'SHOPIFY', 'AMAZON'],
            default: null
            // Only used if taskType is INTEGRATION
        },
        
        // For ACTION tasks
        actionCategory: {
            type: String,
            enum: ['CLIENT_ACTION', 'STAFF_ACTION'],
            default: null
            // CLIENT_ACTION = client does it (e.g., "Schedule Call")
            // STAFF_ACTION = internal work (e.g., "Review Records")
        },
        
        // DEFAULT SETTINGS (applied when creating task from template)
        defaultPriority: {
            type: String,
            enum: ['HIGH', 'MEDIUM', 'LOW'],
            default: 'MEDIUM'
        },
        
        defaultDueInDays: {
            type: Number,
            default: 7,
            min: 1,
            max: 365
            // Task will be due X days from creation
        },
        
        // VISIBILITY & PERMISSIONS
        visibility: {
            type: String,
            enum: ['SYSTEM', 'ORGANIZATION', 'PRIVATE'],
            default: 'ORGANIZATION',
            required: true
            // SYSTEM = Built-in templates (everyone sees, can't delete)
            // ORGANIZATION = Shared with all admins/staff (default)
            // PRIVATE = Only visible to creator
        },
        
        availableFor: {
            type: [String],
            enum: ['ADMIN', 'STAFF'],
            default: ['ADMIN', 'STAFF']
            // Who can use this template to create tasks
        },
        
        // TEMPLATE TYPE
        isSystemTemplate: {
            type: Boolean,
            default: false
            // true = Built-in template (cannot be deleted)
            // false = Custom template (can be edited/deleted by creator)
        },
        
        // CREATOR
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null
            // null for system templates
            // User ID for custom templates
        },
        
        // USAGE TRACKING
        usageCount: {
            type: Number,
            default: 0
            // Incremented each time template is used to create a task
        },
        
        lastUsedAt: {
            type: Date,
            default: null
            // Last time this template was used
        },
        
        // STATUS
        active: {
            type: Boolean,
            default: true
            // Inactive templates don't show in create task flow
        }
    },
    { timestamps: true } // Adds createdAt and updatedAt automatically
);

// INDEXES FOR PERFORMANCE
taskTemplateSchema.index({ visibility: 1, active: 1 });
taskTemplateSchema.index({ category: 1, active: 1 });
taskTemplateSchema.index({ createdBy: 1 });
taskTemplateSchema.index({ isSystemTemplate: 1, active: 1 });
taskTemplateSchema.index({ usageCount: -1 }); // For "most used" queries

// VALIDATION: Ensure type-specific fields are set correctly
taskTemplateSchema.pre('save', function(next) {
    // If DOCUMENT_UPLOAD, must have documentType
    if (this.taskType === 'DOCUMENT_UPLOAD' && !this.documentType) {
        return next(new Error('documentType is required for DOCUMENT_UPLOAD templates'));
    }
    
    // If INTEGRATION, must have integrationType
    if (this.taskType === 'INTEGRATION' && !this.integrationType) {
        return next(new Error('integrationType is required for INTEGRATION templates'));
    }
    
    // If ACTION, must have actionCategory
    if (this.taskType === 'ACTION' && !this.actionCategory) {
        return next(new Error('actionCategory is required for ACTION templates'));
    }
    
    next();
});

module.exports = mongoose.model("TaskTemplate", taskTemplateSchema);