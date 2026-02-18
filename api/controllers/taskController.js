const Task = require('../models/taskModel');
const User = require('../models/userModel');
const Settings = require('../models/settingsModel');
const TaskTemplate = require('../models/taskTemplateModel');

// CREATE TASK
exports.createTask = async (req, res) => {
    try {
        const {
            title,
            description,
            taskType,
            priority,
            dueDate,
            assignedTo,
            clientId,
            integrationType,
            // NEW TEMPLATE FIELDS
            templateId,
            templateName,
            documentType,
            actionCategory
        } = req.body;

        const createdBy = req.user._id;

        // Validate required fields
        if (!title || !description || !taskType || !dueDate || !assignedTo) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields'
            });
        }

        // Validate type-specific fields
        if (taskType === 'DOCUMENT_UPLOAD' && !documentType) {
            return res.status(400).json({
                success: false,
                message: 'documentType is required for DOCUMENT_UPLOAD tasks'
            });
        }

        if (taskType === 'INTEGRATION' && !integrationType) {
            return res.status(400).json({
                success: false,
                message: 'integrationType is required for INTEGRATION tasks'
            });
        }

        if (taskType === 'ACTION' && !actionCategory) {
            return res.status(400).json({
                success: false,
                message: 'actionCategory is required for ACTION tasks'
            });
        }

        // Get assignee details to determine role
        const assignee = await User.findById(assignedTo);
        if (!assignee) {
            return res.status(404).json({
                success: false,
                message: 'Assignee not found'
            });
        }

        // Determine clientId and staffId based on role_id
        let finalClientId = clientId;
        let finalStaffId = null;
        let assignedToRole = '';

        if (assignee.role_id === '3') { // CLIENT
            assignedToRole = 'CLIENT';
            finalClientId = assignedTo;
            // Find staff assigned to this client
            const AssignClient = require('../models/assignClientsModel');
            const assignment = await AssignClient.findOne({ clientId: assignedTo });
            finalStaffId = assignment ? assignment.staffId : req.user._id;
        } else if (assignee.role_id === '2') { // STAFF
            assignedToRole = 'STAFF';
            finalStaffId = assignedTo;
            // clientId must be provided for staff tasks
            if (!clientId) {
                return res.status(400).json({
                    success: false,
                    message: 'clientId is required for staff tasks'
                });
            }
        } else if (assignee.role_id === '1') { // ADMIN
            assignedToRole = 'ADMIN';
            if (clientId) {
                finalClientId = clientId;
            }
        }

        // Create task
        const task = await Task.create({
            title,
            description,
            taskType,
            status: 'NOT_STARTED',
            priority: priority || 'MEDIUM',
            dueDate,
            assignedTo,
            assignedBy: createdBy,
            assignedToRole: assignedToRole,
            clientId: finalClientId,
            staffId: finalStaffId,
            integrationType: taskType === 'INTEGRATION' ? integrationType : null,
            // NEW TEMPLATE FIELDS
            templateId: templateId || null,
            templateName: templateName || null,
            documentType: documentType || null,
            actionCategory: actionCategory || null,
            statusHistory: [{
                status: 'NOT_STARTED',
                changedBy: createdBy,
                changedAt: new Date(),
                notes: 'Task created'
            }],
            assignmentHistory: [{
                assignedTo,
                assignedBy: createdBy,
                assignedAt: new Date()
            }]
        });

        // If created from template, increment usage count
        if (templateId) {
            await TaskTemplate.findByIdAndUpdate(templateId, {
                $inc: { usageCount: 1 },
                lastUsedAt: new Date()
            });
        }

        // Populate assignee details
        await task.populate('assignedTo', 'name email');
        await task.populate('assignedBy', 'name email');

        // TODO: Send notification (will implement later)

        res.status(201).json({
            success: true,
            message: 'Task created successfully',
            data: task
        });

    } catch (error) {
        console.error('Create task error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create task',
            error: error.message
        });
    }
};

// GET TASKS (with filters)
exports.getTasks = async (req, res) => {
    try {
        const user = req.user;
        console.log('Get tasks for user:', user._id, 'role:', user.role_id);
        const {
            clientId,
            staffId,
            status,
            taskType,
            priority,
            dueDateFrom,
            dueDateTo,
            overdue,
            page = 1,
            limit = 50,
            sortBy = 'dueDate',
            sortOrder = 'asc'
        } = req.query;

        // Build query based on user role
        let query = {};

        if (user.role_id === '1') { // ADMIN
            // Admin can see all tasks
            if (clientId) query.clientId = clientId;
            if (staffId) query.staffId = staffId;
        } else if (user.role_id === '2') { // STAFF
            // Staff can see tasks for their assigned clients OR tasks assigned to them
            const AssignClient = require('../models/assignClientsModel');
            const assignments = await AssignClient.find({ staffId: user._id }).select('clientId');
            const clientIds = assignments.map(a => a.clientId);

            query.$or = [
                { clientId: { $in: clientIds } },
                { assignedTo: user._id }
            ];

            // Apply additional filters
            if (clientId) query.clientId = clientId;
        } else if (user.role_id === '3') { // CLIENT
            // Client can only see their own tasks
            query.assignedTo = user._id;
        }

        // Apply common filters
        if (status) {
            const statuses = status.split(',');
            query.status = { $in: statuses };
        }

        if (taskType) query.taskType = taskType;
        if (priority) query.priority = priority;

        if (dueDateFrom || dueDateTo) {
            query.dueDate = {};
            if (dueDateFrom) query.dueDate.$gte = new Date(dueDateFrom);
            if (dueDateTo) query.dueDate.$lte = new Date(dueDateTo);
        }

        if (overdue === 'true') {
            query.dueDate = { $lt: new Date() };
            query.status = { $nin: ['COMPLETED', 'CANCELLED'] };
        }

        // Pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);

        // Sort
        const sort = {};
        sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

        // Execute query
        const tasks = await Task.find(query)
            .populate('assignedTo', 'first_name last_name email')
            .populate('assignedBy', 'first_name last_name email')
            .populate('clientId', 'first_name last_name email')
            .populate('staffId', 'first_name last_name email')
            .sort(sort)
            .skip(skip)
            .limit(parseInt(limit));

        // Get total count
        const totalItems = await Task.countDocuments(query);
        const totalPages = Math.ceil(totalItems / parseInt(limit));

        // Calculate stats
        const stats = {
            total: totalItems,
            overdue: await Task.countDocuments({
                ...query,
                dueDate: { $lt: new Date() },
                status: { $nin: ['COMPLETED', 'CANCELLED'] }
            }),
            dueThisWeek: await Task.countDocuments({
                ...query,
                dueDate: {
                    $gte: new Date(),
                    $lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
                },
                status: { $nin: ['COMPLETED', 'CANCELLED'] }
            }),
            pendingReview: await Task.countDocuments({
                ...query,
                status: 'PENDING_REVIEW'
            })
        };

        

        res.status(200).json({
            success: true,
            data: {
                tasks,
                pagination: {
                    currentPage: parseInt(page),
                    totalPages,
                    totalItems,
                    itemsPerPage: parseInt(limit)
                },
                stats
            }
        });

    } catch (error) {
        console.error('Get tasks error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch tasks',
            error: error.message
        });
    }
};

// GET SINGLE TASK
exports.getTask = async (req, res) => {
    try {
        // Task is already loaded by middleware
        const task = req.task;

        // Populate all references
        await task.populate('assignedTo', 'first_name last_name email');
        await task.populate('assignedBy', 'first_name last_name email');
        await task.populate('clientId', 'first_name last_name email');
        await task.populate('staffId', 'first_name last_name email');
        await task.populate('reviewedBy', 'first_name last_name email');
        await task.populate('helpRequests.requestedBy', 'first_name last_name email');
        await task.populate('helpRequests.resolvedBy', 'first_name last_name email');

        // Calculate days until due
        const now = new Date();
        const dueDate = new Date(task.dueDate);
        const daysUntilDue = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));
        const isOverdue = daysUntilDue < 0 && !['COMPLETED', 'CANCELLED'].includes(task.status);

        res.status(200).json({
            success: true,
            data: {
                ...task.toObject(),
                daysUntilDue,
                isOverdue
            }
        });

    } catch (error) {
        console.error('Get task error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch task',
            error: error.message
        });
    }
};

// UPDATE TASK
exports.updateTask = async (req, res) => {
    try {
        const task = req.task;
        const { title, description, priority, dueDate } = req.body;

        // Update allowed fields
        if (title) task.title = title;
        if (description) task.description = description;
        if (priority) task.priority = priority;
        if (dueDate) task.dueDate = dueDate;

        task.updatedAt = new Date();

        await task.save();

        res.status(200).json({
            success: true,
            message: 'Task updated successfully',
            data: task
        });

    } catch (error) {
        console.error('Update task error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update task',
            error: error.message
        });
    }
};

// DELETE TASK
exports.deleteTask = async (req, res) => {
    try {
        const taskId = req.params.taskId || req.params.id;

        await Task.findByIdAndDelete(taskId);

        res.status(200).json({
            success: true,
            message: 'Task deleted successfully'
        });

    } catch (error) {
        console.error('Delete task error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete task',
            error: error.message
        });
    }
};

// UPDATE TASK STATUS
exports.updateTaskStatus = async (req, res) => {
    try {
        const task = req.task; // From middleware
        const { status, notes } = req.body;
        const user = req.user;

        if (!status) {
            return res.status(400).json({
                success: false,
                message: 'Status is required'
            });
        }

        // Update status
        const oldStatus = task.status;
        task.status = status;

        // Add to status history
        task.statusHistory.push({
            status,
            changedBy: user._id,
            changedAt: new Date(),
            notes: notes || `Status changed from ${oldStatus} to ${status}`
        });

        // Set completedAt if status is COMPLETED
        if (status === 'COMPLETED' && !task.completedAt) {
            task.completedAt = new Date();
        }

        task.updatedAt = new Date();

        await task.save();

        // TODO: Send notification based on status change

        res.status(200).json({
            success: true,
            message: 'Task status updated successfully',
            data: {
                _id: task._id,
                status: task.status,
                statusHistory: task.statusHistory
            }
        });

    } catch (error) {
        console.error('Update status error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update task status',
            error: error.message
        });
    }
};

// UPLOAD DOCUMENT
exports.uploadDocument = async (req, res) => {
    try {
        const task = req.task;
        const user = req.user;

        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No file uploaded'
            });
        }

        // File is already uploaded to S3 by multer middleware
        // req.file contains: filename, fileUrl, size, mimetype

        const document = {
            fileName: req.file.originalname,
            fileUrl: req.file.location || req.file.path, // S3 URL or local path
            fileSize: req.file.size,
            mimeType: req.file.mimetype,
            uploadedAt: new Date(),
            uploadedBy: user._id
        };

        task.documents.push(document);

        // Auto-change status to PENDING_REVIEW if it's a document task
        if (task.taskType === 'DOCUMENT_UPLOAD' && task.status === 'IN_PROGRESS') {
            task.status = 'PENDING_REVIEW';
            task.statusHistory.push({
                status: 'PENDING_REVIEW',
                changedBy: user._id,
                changedAt: new Date(),
                notes: 'Document uploaded, awaiting review'
            });
        }

        task.updatedAt = new Date();

        await task.save();

        // TODO: Send notification to staff

        res.status(200).json({
            success: true,
            message: 'Document uploaded successfully',
            data: {
                taskId: task._id,
                document,
                task: {
                    status: task.status
                }
            }
        });

    } catch (error) {
        console.error('Upload document error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to upload document',
            error: error.message
        });
    }
};

// APPROVE TASK
exports.approveTask = async (req, res) => {
    try {
        const task = req.task;
        const user = req.user;
        const { reviewNotes } = req.body;

        // Update task
        task.status = 'COMPLETED';
        task.completedAt = new Date();
        task.reviewedBy = user._id;
        task.reviewedAt = new Date();
        task.reviewNotes = reviewNotes || '';

        // Add to status history
        task.statusHistory.push({
            status: 'COMPLETED',
            changedBy: user._id,
            changedAt: new Date(),
            notes: 'Task approved'
        });

        task.updatedAt = new Date();

        await task.save();

        // TODO: Send notification to client

        res.status(200).json({
            success: true,
            message: 'Task approved successfully',
            data: {
                status: task.status,
                completedAt: task.completedAt,
                reviewedBy: task.reviewedBy
            }
        });

    } catch (error) {
        console.error('Approve task error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to approve task',
            error: error.message
        });
    }
};

// REJECT TASK
exports.rejectTask = async (req, res) => {
    try {
        const task = req.task;
        const user = req.user;
        const { rejectionReason } = req.body;

        if (!rejectionReason) {
            return res.status(400).json({
                success: false,
                message: 'Rejection reason is required'
            });
        }

        // Update task
        task.status = 'NEEDS_REVISION';
        task.reviewedBy = user._id;
        task.reviewedAt = new Date();
        task.rejectionReason = rejectionReason;

        // Add to status history
        task.statusHistory.push({
            status: 'NEEDS_REVISION',
            changedBy: user._id,
            changedAt: new Date(),
            notes: `Task rejected: ${rejectionReason}`
        });

        task.updatedAt = new Date();

        await task.save();

        // TODO: Send notification to client

        res.status(200).json({
            success: true,
            message: 'Task rejected successfully',
            data: {
                status: task.status,
                rejectionReason: task.rejectionReason,
                reviewedBy: task.reviewedBy
            }
        });

    } catch (error) {
        console.error('Reject task error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to reject task',
            error: error.message
        });
    }
};

// REQUEST HELP
exports.requestHelp = async (req, res) => {
    try {
        const task = req.task;
        const user = req.user;
        const { message } = req.body;

        // Add help request
        const helpRequest = {
            requestedAt: new Date(),
            requestedBy: user._id,
            message: message || 'Client requested help',
            resolvedAt: null,
            resolvedBy: null
        };

        task.helpRequests.push(helpRequest);
        task.updatedAt = new Date();

        await task.save();

        // TODO: Send notification to staff/admin

        res.status(200).json({
            success: true,
            message: 'Help request sent successfully',
            data: {
                helpRequest
            }
        });

    } catch (error) {
        console.error('Request help error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send help request',
            error: error.message
        });
    }
};