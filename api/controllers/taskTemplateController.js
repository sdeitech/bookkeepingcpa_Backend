const TaskTemplate = require('../models/taskTemplateModel');
const Task = require('../models/taskModel');

const DEFAULT_ASSIGNABLE_TO = ['STAFF', 'CLIENT'];
const VALID_ASSIGNABLE_ROLES = ['ADMIN', 'STAFF', 'CLIENT'];
const normalizeAssignableRoles = (roles) => (
    Array.isArray(roles)
        ? roles.map((role) => String(role).toUpperCase())
        : roles
);

const normalizeTemplateAssignableTo = (template) => {
    const templateObj = template?.toObject ? template.toObject() : template;
    const assignableTo = Array.isArray(templateObj?.assignableTo) && templateObj.assignableTo.length > 0
        ? templateObj.assignableTo
        : DEFAULT_ASSIGNABLE_TO;

    return {
        ...templateObj,
        assignableTo
    };
};

const buildRequiredDocuments = ({ taskType, requiredDocuments, documentType }) => {
    if (taskType !== 'DOCUMENT_UPLOAD') return [];

    if (Array.isArray(requiredDocuments) && requiredDocuments.length > 0) {
        return requiredDocuments
            .map((doc) => {
                if (typeof doc === 'string') {
                    return {
                        type: doc.trim(),
                        isCustom: false,
                        isRequired: true
                    };
                }

                if (doc && typeof doc === 'object' && typeof doc.type === 'string') {
                    return {
                        type: doc.type.trim(),
                        isCustom: Boolean(doc.isCustom),
                        isRequired: doc.isRequired !== false
                    };
                }

                return null;
            })
            .filter((doc) => doc && doc.type);
    }

    if (typeof documentType === 'string' && documentType.trim()) {
        return [{
            type: documentType.trim(),
            isCustom: false,
            isRequired: true
        }];
    }

    return [];
};

// GET ALL TEMPLATES (with filters)
exports.getTemplates = async (req, res) => {
    try {
        const user = req.user;
        const { category, active, assignableTo } = req.query;
        
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

        if (assignableTo) {
            const assignableRole = String(assignableTo).toUpperCase();
            if (!VALID_ASSIGNABLE_ROLES.includes(assignableRole)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid assignableTo role. Allowed: ADMIN, STAFF, CLIENT'
                });
            }

            query.$and = query.$and || [];
            query.$and.push({
                $or: [
                    { assignableTo: { $in: [assignableRole] } },
                    { assignableTo: { $exists: false } },
                    { assignableTo: { $size: 0 } }
                ]
            });
        }
        
        const templates = await TaskTemplate.find(query)
            .populate('createdBy', 'first_name last_name email')
            .sort({ isSystemTemplate: -1, usageCount: -1, name: 1 });

        const normalizedTemplates = templates.map(normalizeTemplateAssignableTo);
        
        // Group by category for easier UI rendering
        const grouped = {
            DOCUMENT_UPLOAD: normalizedTemplates.filter(t => t.category === 'DOCUMENT_UPLOAD'),
            INTEGRATION: normalizedTemplates.filter(t => t.category === 'INTEGRATION'),
            ACTION: normalizedTemplates.filter(t => t.category === 'ACTION'),
            REVIEW: normalizedTemplates.filter(t => t.category === 'REVIEW')
        };
        
        res.status(200).json({
            success: true,
            data: {
                templates: normalizedTemplates,
                grouped,
                total: normalizedTemplates.length
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
        
        const normalizedTemplate = normalizeTemplateAssignableTo(template);

        res.status(200).json({
            success: true,
            data: normalizedTemplate
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
            requiredDocuments,
            integrationType,
            actionCategory,
            defaultPriority,
            defaultDueInDays,
            visibility,
            availableFor,
            assignableTo
        } = req.body;
        
        // Validate required fields
        if (!name || !category || !taskType) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: name, category, taskType'
            });
        }
        
        // Validate type-specific fields
        const normalizedRequiredDocuments = buildRequiredDocuments({
            taskType,
            requiredDocuments,
            documentType
        });

        if (taskType === 'DOCUMENT_UPLOAD' && normalizedRequiredDocuments.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'requiredDocuments (or documentType) is required for DOCUMENT_UPLOAD templates'
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

        const normalizedAssignableTo = normalizeAssignableRoles(assignableTo);

        if (normalizedAssignableTo && (!Array.isArray(normalizedAssignableTo) || normalizedAssignableTo.length === 0 || !normalizedAssignableTo.every(role => VALID_ASSIGNABLE_ROLES.includes(role)))) {
            return res.status(400).json({
                success: false,
                message: 'assignableTo must be a non-empty array with values: ADMIN, STAFF, CLIENT'
            });
        }
        
        // Create template
        const template = await TaskTemplate.create({
            name,
            description,
            category,
            taskType,
            requiredDocuments: normalizedRequiredDocuments,
            integrationType: integrationType || null,
            actionCategory: actionCategory || null,
            defaultPriority: defaultPriority || 'MEDIUM',
            defaultDueInDays: defaultDueInDays || 7,
            visibility: visibility || 'ORGANIZATION',
            availableFor: availableFor || ['ADMIN', 'STAFF'],
            assignableTo: normalizedAssignableTo || DEFAULT_ASSIGNABLE_TO,
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
            requiredDocuments,
            integrationType,
            actionCategory,
            defaultPriority,
            defaultDueInDays,
            visibility,
            availableFor,
            assignableTo,
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
        if (requiredDocuments !== undefined || documentType !== undefined) {
            const normalizedRequiredDocuments = buildRequiredDocuments({
                taskType: template.taskType,
                requiredDocuments,
                documentType
            });

            if (template.taskType === 'DOCUMENT_UPLOAD' && normalizedRequiredDocuments.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'requiredDocuments (or documentType) is required for DOCUMENT_UPLOAD templates'
                });
            }

            if (template.taskType === 'DOCUMENT_UPLOAD') {
                template.requiredDocuments = normalizedRequiredDocuments;
            }
        }
        if (integrationType !== undefined) template.integrationType = integrationType;
        if (actionCategory !== undefined) template.actionCategory = actionCategory;
        if (defaultPriority) template.defaultPriority = defaultPriority;
        if (defaultDueInDays) template.defaultDueInDays = defaultDueInDays;
        if (visibility) template.visibility = visibility;
        if (availableFor) template.availableFor = availableFor;
        if (assignableTo) {
            const normalizedAssignableTo = normalizeAssignableRoles(assignableTo);

            if (!Array.isArray(normalizedAssignableTo) || normalizedAssignableTo.length === 0 || !normalizedAssignableTo.every(role => VALID_ASSIGNABLE_ROLES.includes(role))) {
                return res.status(400).json({
                    success: false,
                    message: 'assignableTo must be a non-empty array with values: ADMIN, STAFF, CLIENT'
                });
            }
            template.assignableTo = normalizedAssignableTo;
        }
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

exports.toggleTemplate = async (req, res) => {
    try {
        const { id } = req.params;
        console.log("Toggling template with ID:", id);
        const user = req.user;

        const template = await TaskTemplate.findById(id);

        if (!template) {
            return res.status(404).json({
                success: false,
                message: "Template not found"
            });
        }

        // Permission check
        if (
            template.createdBy &&
            template.createdBy.toString() !== user._id.toString() &&
            user.role_id !== "1"
        ) {
            return res.status(403).json({
                success: false,
                message: "Only creator or admin can modify this template"
            });
        }

        // Toggle only the status with an atomic update so full template
        // validation (e.g. requiredDocuments) does not block this action.
        const newActiveState = !template.active;
        await TaskTemplate.updateOne(
            { _id: template._id },
            { $set: { active: newActiveState } }
        );

        res.status(200).json({
            success: true,
            message: `Template ${newActiveState ? "activated" : "deactivated"} successfully`,
            data: {
                _id: template._id,
                active: newActiveState
            }
        });

    } catch (error) {
        console.error("Toggle template error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to toggle template",
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
