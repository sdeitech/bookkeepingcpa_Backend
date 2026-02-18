const TaskTemplate = require('../models/taskTemplateModel');
const Task = require('../models/taskModel');

// GET ALL TEMPLATES (with filters)
exports.getTemplates = async (req, res) => {
    try {
        const user = req.user;
        const { category, active } = req.query;
        
        let query = {};
        
        // Filter by category if provided
        if (category) {
            query.category = category;
        }
        
        // Filter by active status (default: only active)
        query.active = active === 'false' ? false : true;
        
        // Visibility logic
        query.$or = [
            { visibility: 'SYSTEM' },           // System templates (everyone)
            { visibility: 'ORGANIZATION' },     // Shared templates (everyone)
            { 
                visibility: 'PRIVATE',          // Private templates (only creator)
                createdBy: user._id 
            }
        ];
        
        // Role-based filtering
        const userRole = user.role_id === '1' ? 'ADMIN' : 'STAFF';
        query.availableFor = { $in: [userRole] };
        
        const templates = await TaskTemplate.find(query)
            .populate('createdBy', 'first_name last_name email')
            .sort({ isSystemTemplate: -1, usageCount: -1, name: 1 });
        
        // Group by category for easier UI rendering
        const grouped = {
            DOCUMENT_UPLOAD: templates.filter(t => t.category === 'DOCUMENT_UPLOAD'),
            INTEGRATION: templates.filter(t => t.category === 'INTEGRATION'),
            ACTION: templates.filter(t => t.category === 'ACTION'),
            REVIEW: templates.filter(t => t.category === 'REVIEW')
        };
        
        res.status(200).json({
            success: true,
            data: {
                templates,
                grouped,
                total: templates.length
            }
        });
        
    } catch (error) {
        console.error('Get templates error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch templates',
            error: error.message
        });
    }
};

// GET SINGLE TEMPLATE
exports.getTemplate = async (req, res) => {
    try {
        const { templateId } = req.params;
        const user = req.user;
        
        const template = await TaskTemplate.findById(templateId)
            .populate('createdBy', 'first_name last_name email');
        
        if (!template) {
            return res.status(404).json({
                success: false,
                message: 'Template not found'
            });
        }
        
        // Check visibility
        if (template.visibility === 'PRIVATE' && 
            template.createdBy && 
            template.createdBy._id.toString() !== user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Access denied to this template'
            });
        }
        
        res.status(200).json({
            success: true,
            data: template
        });
        
    } catch (error) {
        console.error('Get template error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch template',
            error: error.message
        });
    }
};

// CREATE TEMPLATE
exports.createTemplate = async (req, res) => {
    try {
        const user = req.user;
        const {
            name,
            description,
            category,
            taskType,
            documentType,
            integrationType,
            actionCategory,
            defaultPriority,
            defaultDueInDays,
            visibility,
            availableFor
        } = req.body;
        
        // Validate required fields
        if (!name || !category || !taskType) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: name, category, taskType'
            });
        }
        
        // Validate type-specific fields
        if (taskType === 'DOCUMENT_UPLOAD' && !documentType) {
            return res.status(400).json({
                success: false,
                message: 'documentType is required for DOCUMENT_UPLOAD templates'
            });
        }
        
        if (taskType === 'INTEGRATION' && !integrationType) {
            return res.status(400).json({
                success: false,
                message: 'integrationType is required for INTEGRATION templates'
            });
        }
        
        if (taskType === 'ACTION' && !actionCategory) {
            return res.status(400).json({
                success: false,
                message: 'actionCategory is required for ACTION templates'
            });
        }
        
        // Create template
        const template = await TaskTemplate.create({
            name,
            description,
            category,
            taskType,
            documentType: documentType || null,
            integrationType: integrationType || null,
            actionCategory: actionCategory || null,
            defaultPriority: defaultPriority || 'MEDIUM',
            defaultDueInDays: defaultDueInDays || 7,
            visibility: visibility || 'ORGANIZATION',
            availableFor: availableFor || ['ADMIN', 'STAFF'],
            isSystemTemplate: false,
            createdBy: user._id,
            active: true
        });
        
        await template.populate('createdBy', 'first_name last_name email');
        
        res.status(201).json({
            success: true,
            message: 'Template created successfully',
            data: template
        });
        
    } catch (error) {
        console.error('Create template error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create template',
            error: error.message
        });
    }
};

// UPDATE TEMPLATE
exports.updateTemplate = async (req, res) => {
    try {
        const { templateId } = req.params;
        const user = req.user;
        const {
            name,
            description,
            documentType,
            integrationType,
            actionCategory,
            defaultPriority,
            defaultDueInDays,
            visibility,
            availableFor,
            active
        } = req.body;
        
        const template = await TaskTemplate.findById(templateId);
        
        if (!template) {
            return res.status(404).json({
                success: false,
                message: 'Template not found'
            });
        }
        
        // Check if user can edit
        if (template.isSystemTemplate) {
            return res.status(403).json({
                success: false,
                message: 'Cannot edit system templates'
            });
        }
        
        if (template.createdBy && template.createdBy.toString() !== user._id.toString() && user.role_id !== '1') {
            return res.status(403).json({
                success: false,
                message: 'Only the creator or admin can edit this template'
            });
        }
        
        // Update fields
        if (name) template.name = name;
        if (description !== undefined) template.description = description;
        if (documentType !== undefined) template.documentType = documentType;
        if (integrationType !== undefined) template.integrationType = integrationType;
        if (actionCategory !== undefined) template.actionCategory = actionCategory;
        if (defaultPriority) template.defaultPriority = defaultPriority;
        if (defaultDueInDays) template.defaultDueInDays = defaultDueInDays;
        if (visibility) template.visibility = visibility;
        if (availableFor) template.availableFor = availableFor;
        if (active !== undefined) template.active = active;
        
        await template.save();
        await template.populate('createdBy', 'first_name last_name email');
        
        res.status(200).json({
            success: true,
            message: 'Template updated successfully',
            data: template
        });
        
    } catch (error) {
        console.error('Update template error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update template',
            error: error.message
        });
    }
};

// DELETE TEMPLATE (Soft delete - mark as inactive)
exports.deleteTemplate = async (req, res) => {
    try {
        const { templateId } = req.params;
        const user = req.user;
        
        const template = await TaskTemplate.findById(templateId);
        
        if (!template) {
            return res.status(404).json({
                success: false,
                message: 'Template not found'
            });
        }
        
        // Check if user can delete
        if (template.isSystemTemplate) {
            return res.status(403).json({
                success: false,
                message: 'Cannot delete system templates'
            });
        }
        
        if (template.createdBy && template.createdBy.toString() !== user._id.toString() && user.role_id !== '1') {
            return res.status(403).json({
                success: false,
                message: 'Only the creator or admin can delete this template'
            });
        }
        
        // Check if template is in use
        const tasksUsingTemplate = await Task.countDocuments({ templateId });
        
        if (tasksUsingTemplate > 0) {
            // Soft delete - mark as inactive
            template.active = false;
            await template.save();
            
            return res.status(200).json({
                success: true,
                message: `Template marked as inactive. ${tasksUsingTemplate} tasks are using this template.`,
                data: {
                    templateId: template._id,
                    active: false,
                    tasksUsingTemplate
                }
            });
        }
        
        // Hard delete if no tasks are using it
        await TaskTemplate.findByIdAndDelete(templateId);
        
        res.status(200).json({
            success: true,
            message: 'Template deleted successfully'
        });
        
    } catch (error) {
        console.error('Delete template error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete template',
            error: error.message
        });
    }
};

// GET TEMPLATE USAGE STATS
exports.getTemplateStats = async (req, res) => {
    try {
        const { templateId } = req.params;
        
        const template = await TaskTemplate.findById(templateId);
        
        if (!template) {
            return res.status(404).json({
                success: false,
                message: 'Template not found'
            });
        }
        
        // Get tasks created from this template
        const tasks = await Task.find({ templateId })
            .select('status createdAt completedAt')
            .sort({ createdAt: -1 });
        
        // Calculate stats
        const stats = {
            totalUsage: template.usageCount,
            lastUsed: template.lastUsedAt,
            tasksByStatus: {
                NOT_STARTED: tasks.filter(t => t.status === 'NOT_STARTED').length,
                IN_PROGRESS: tasks.filter(t => t.status === 'IN_PROGRESS').length,
                PENDING_REVIEW: tasks.filter(t => t.status === 'PENDING_REVIEW').length,
                NEEDS_REVISION: tasks.filter(t => t.status === 'NEEDS_REVISION').length,
                COMPLETED: tasks.filter(t => t.status === 'COMPLETED').length,
                CANCELLED: tasks.filter(t => t.status === 'CANCELLED').length
            },
            recentTasks: tasks.slice(0, 10)
        };
        
        res.status(200).json({
            success: true,
            data: {
                template: {
                    _id: template._id,
                    name: template.name,
                    category: template.category
                },
                stats
            }
        });
        
    } catch (error) {
        console.error('Get template stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch template stats',
            error: error.message
        });
    }
};
