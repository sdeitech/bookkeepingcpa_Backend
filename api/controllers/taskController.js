const Task = require('../models/taskModel');
const User = require('../models/userModel');
const Settings = require('../models/settingsModel');
const TaskTemplate = require('../models/taskTemplateModel');
const TaskDocument = require('../models/taskDocumentModel');
const notificationHelper = require('../helpers/notificationHelper');
const { PutObjectCommand } = require("@aws-sdk/client-s3");
const s3 = require("../config/s3");

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
            actionCategory,
            // NEW: Required documents
            requiredDocuments
        } = req.body;

        const createdBy = req.user._id;

        // Validate required fields
        if (!title  || !taskType || !dueDate || !assignedTo) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields'
            });
        }

        // Validate type-specific fields
        if (taskType === 'DOCUMENT_UPLOAD' && (!requiredDocuments || requiredDocuments.length === 0)) {
            return res.status(400).json({
                success: false,
                message: 'requiredDocuments is required for DOCUMENT_UPLOAD tasks'
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
            const client = await User.findById(assignedTo).select('assignedTo');
            finalStaffId = client?.assignedTo || req.user._id;
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
            actionCategory: actionCategory || null,
            // NEW: Required documents
            requiredDocuments: requiredDocuments || [],
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
        await task.populate('assignedTo', 'first_name last_name email');
        await task.populate('assignedBy', 'first_name last_name email');
        await task.populate('clientId', 'first_name last_name email');

        // Send notification if task is assigned to a client
        try {
            if (assignedToRole === 'CLIENT') {
                const client = await User.findById(finalClientId);
                const assignedBy = await User.findById(createdBy);
                
                if (client && assignedBy) {
                    await notificationHelper.notifyTaskAssigned(task, client, assignedBy);
                }
            }
        } catch (notifError) {
            console.error('Notification error:', notifError);
            // Don't fail the request if notification fails
        }

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
        const {
            clientId,
            staffId,
            assignedBy,
            status,
            taskType,
            category,
            priority,
            dueDateFrom,
            dueDateTo,
            dueDateFilter,
            overdue,
            viewFilter,
            search,
            page = 1,
            limit = 50,
            sortBy = 'createdAt',
            sortOrder = 'desc'
        } = req.query;

        // Build query based on user role
        let query = {};

        // Exclude deleted tasks by default (unless explicitly requested)
        query.deleted = { $ne: true };

        if (user.role_id === '1') { // ADMIN
            // Admin can see all tasks
            if (clientId) query.clientId = clientId;
            if (staffId) query.staffId = staffId;
        }else if (user.role_id === '2') { // STAFF

            const staffMember = await User.findById(user._id).select('assignedClients');
            const clientIds = staffMember?.assignedClients || [];
        
            if (viewFilter === 'staff_tasks') {
        
                // Tasks assigned directly to staff
                query.assignedTo = user._id;
                query.assignedToRole = 'STAFF';
        
            } else {
        
                // Client tasks staff manages
                query.clientId = { $in: clientIds };
                query.assignedToRole = 'CLIENT';
        
            }
        }else if (user.role_id === '3') { // CLIENT
            // Client can only see their own tasks
            query.assignedTo = user._id;
        }

        // Apply assignedBy filter
        if (assignedBy) {
            query.assignedBy = assignedBy;
        }

        // Apply status filter (supports comma-separated values)
        if (status) {
            const statuses = status.split(',').map(s => s.trim().toUpperCase());
            query.status = { $in: statuses };
        }

        // Apply taskType filter
        if (taskType) {
            query.taskType = taskType.toUpperCase();
        }

        // Apply category filter (maps to taskType)
        if (category && !taskType) {
            const categoryMap = {
                'doc_upload': 'DOCUMENT_UPLOAD',
                'integration': 'INTEGRATION',
                'action': 'ACTION',
                'review': 'REVIEW'
            };
            
            if (categoryMap[category]) {
                query.taskType = categoryMap[category];
            }
        }

        // Apply priority filter
        if (priority) {
            query.priority = priority.toUpperCase();
        }

        // Apply view filter (client_tasks, staff_tasks)
        if (viewFilter) {
            if (viewFilter === 'client_tasks') {
                query.assignedToRole = 'CLIENT';
            } else if (viewFilter === 'staff_tasks') {
                query.assignedToRole = 'STAFF';
            }
        }

        // Apply due date filters
        if (dueDateFilter && !dueDateFrom && !dueDateTo) {
            const now = new Date();
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            
            if (dueDateFilter === 'today') {
                const tomorrow = new Date(today);
                tomorrow.setDate(tomorrow.getDate() + 1);
                query.dueDate = { $gte: today, $lt: tomorrow };
            } else if (dueDateFilter === 'this_week') {
                const weekStart = new Date(today);
                const dayOfWeek = today.getDay();
                const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Monday
                weekStart.setDate(today.getDate() + diff);
                weekStart.setHours(0, 0, 0, 0);
                
                const weekEnd = new Date(weekStart);
                weekEnd.setDate(weekStart.getDate() + 7);
                
                query.dueDate = { $gte: weekStart, $lt: weekEnd };
            } else if (dueDateFilter === 'overdue') {
                query.dueDate = { $lt: today };
                query.status = { $nin: ['COMPLETED', 'CANCELLED'] };
            }
        } else if (dueDateFrom || dueDateTo) {
            query.dueDate = {};
            if (dueDateFrom) query.dueDate.$gte = new Date(dueDateFrom);
            if (dueDateTo) query.dueDate.$lte = new Date(dueDateTo);
        }

        // Apply overdue filter (legacy support)
        if (overdue === 'true' && !dueDateFilter) {
            query.dueDate = { $lt: new Date() };
            query.status = { $nin: ['COMPLETED', 'CANCELLED'] };
        }

        // Apply search filter
        if (search) {
            const searchRegex = new RegExp(search, 'i');
            
            // Search in task fields
            const searchConditions = [
                { title: searchRegex },
                { description: searchRegex }
            ];
            
            // Combine with existing $or query (for staff role)
            if (query.$or) {
                // If $or already exists, wrap it with $and
                query.$and = [
                    { $or: query.$or },
                    { $or: searchConditions }
                ];
                delete query.$or;
            } else {
                query.$or = searchConditions;
            }
        }

        // Get filter options based on the query (before pagination)
        const filterOptions = await getTaskFilterOptions(query);

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

        console.log(query)

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
                stats,
                filterOptions
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

/**
 * Get filter options based on current query
 * Returns unique values for clients, assignedTo, and assignedBy
 */
async function getTaskFilterOptions(query) {
    try {
        // Get unique clients with their names
        const clients = await Task.aggregate([
            { $match: query },
            { $group: { _id: "$clientId" } },
            {
                $lookup: {
                    from: "users",
                    localField: "_id",
                    foreignField: "_id",
                    as: "clientInfo"
                }
            },
            {
                $project: {
                    value: "$_id",
                    label: {
                        $concat: [
                            { $ifNull: [{ $arrayElemAt: ["$clientInfo.first_name", 0] }, ""] },
                            " ",
                            { $ifNull: [{ $arrayElemAt: ["$clientInfo.last_name", 0] }, ""] }
                        ]
                    }
                }
            },
            { $match: { label: { $ne: " " } } }, // Filter out empty labels
            { $sort: { label: 1 } }
        ]);

        // Get unique assignedTo users with their names
        const assignedTo = await Task.aggregate([
            { $match: query },
            { $group: { _id: "$assignedTo" } },
            {
                $lookup: {
                    from: "users",
                    localField: "_id",
                    foreignField: "_id",
                    as: "userInfo"
                }
            },
            {
                $project: {
                    value: "$_id",
                    label: {
                        $concat: [
                            { $ifNull: [{ $arrayElemAt: ["$userInfo.first_name", 0] }, ""] },
                            " ",
                            { $ifNull: [{ $arrayElemAt: ["$userInfo.last_name", 0] }, ""] }
                        ]
                    }
                }
            },
            { $match: { label: { $ne: " " } } },
            { $sort: { label: 1 } }
        ]);

        // Get unique assignedBy users with their names
        const assignedBy = await Task.aggregate([
            { $match: query },
            { $group: { _id: "$assignedBy" } },
            {
                $lookup: {
                    from: "users",
                    localField: "_id",
                    foreignField: "_id",
                    as: "userInfo"
                }
            },
            {
                $project: {
                    value: "$_id",
                    label: {
                        $concat: [
                            { $ifNull: [{ $arrayElemAt: ["$userInfo.first_name", 0] }, ""] },
                            " ",
                            { $ifNull: [{ $arrayElemAt: ["$userInfo.last_name", 0] }, ""] }
                        ]
                    }
                }
            },
            { $match: { label: { $ne: " " } } },
            { $sort: { label: 1 } }
        ]);

        return {
            clients: clients.filter(c => c.value && c.label.trim()),
            assignedTo: assignedTo.filter(u => u.value && u.label.trim()),
            assignedBy: assignedBy.filter(u => u.value && u.label.trim())
        };
    } catch (error) {
        console.error('Error getting filter options:', error);
        return {
            clients: [],
            assignedTo: [],
            assignedBy: []
        };
    }
}

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

        // Fetch documents from TaskDocument collection
        const documents = await TaskDocument.find({
            taskId: task._id,
            status: 'active'
        })
        .populate('uploadedBy', 'first_name last_name email')
        .populate('reviewedBy', 'first_name last_name email')
        .sort({ createdAt: -1 });

        // Calculate days until due
        const now = new Date();
        const dueDate = new Date(task.dueDate);
        const daysUntilDue = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));
        const isOverdue = daysUntilDue < 0 && !['COMPLETED', 'CANCELLED'].includes(task.status);

        res.status(200).json({
            success: true,
            data: {
                ...task.toObject(),
                documents: documents, // From TaskDocument collection
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

// DELETE TASK (SOFT DELETE)
exports.deleteTask = async (req, res) => {
    try {
        const taskId = req.params.taskId || req.params.id;
        const userId = req.user.id;

        // Soft delete the task instead of hard delete
        const updatedTask = await Task.findByIdAndUpdate(
            taskId,
            {
                deleted: true,
                deletedAt: new Date(),
                deletedBy: userId
            },
            { new: true }
        );

        if (!updatedTask) {
            return res.status(404).json({
                success: false,
                message: 'Task not found'
            });
        }

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

        // Define valid status transitions (Jira-style strict enforcement)
        const validTransitions = {
            'NOT_STARTED': ['IN_PROGRESS', 'ON_HOLD'],
            'IN_PROGRESS': ['PENDING_REVIEW', 'NEEDS_REVISION', 'ON_HOLD'],
            'PENDING_REVIEW': ['COMPLETED', 'NEEDS_REVISION', 'ON_HOLD'],
            'NEEDS_REVISION': ['IN_PROGRESS', 'ON_HOLD'],
            'ON_HOLD': ['IN_PROGRESS'], // Always resume to IN_PROGRESS
            'COMPLETED': [] // Cannot change from completed
        };

        const oldStatus = task.status;

        // Check if transition is valid (unless staying in same status)
        if (status !== oldStatus) {
            const allowedStatuses = validTransitions[oldStatus] || [];
            
            if (!allowedStatuses.includes(status)) {
                return res.status(400).json({
                    success: false,
                    message: `Invalid status transition: Cannot change from ${oldStatus} to ${status}. Allowed transitions: ${allowedStatuses.join(', ') || 'None'}`
                });
            }
        }

        // Permission check for ON_HOLD status
        if (status === 'ON_HOLD') {
            const isAdmin = user.role_id === '1';
            const isTaskCreator = task.assignedBy.toString() === user._id.toString();
            
            if (!isAdmin && !isTaskCreator) {
                return res.status(403).json({
                    success: false,
                    message: 'Only admin or task creator can put task on hold'
                });
            }
        }

        // Update status
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

// UPLOAD DOCUMENT- S3
exports.uploadDocument = async (req, res) => {
    try {
        const task = req.task;
        const user = req.user;
        const { documentType, isAdditional } = req.body;

        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No file uploaded'
            });
        }

        // 🔥 Generate S3 file key based on document type
        let fileKey;
        if (documentType && !isAdditional) {
            // Required document with specific type
            fileKey = `task-documents/${task._id}/${documentType}/${Date.now()}-${req.file.originalname}`;
        } else {
            // Additional document (no specific type)
            fileKey = `task-documents/${task._id}/additional/${Date.now()}-${req.file.originalname}`;
        }

        // 🔥 Upload to S3 (PRIVATE)
        await s3.send(
            new PutObjectCommand({
                Bucket: process.env.AWS_BUCKET_NAME,
                Key: fileKey,
                Body: req.file.buffer,
                ContentType: req.file.mimetype,
            })
        );

        // Create TaskDocument record
        const taskDocument = await TaskDocument.create({
            taskId: task._id,
            documentType: isAdditional ? null : documentType, // null for additional documents
            userId: task.clientId,
            fileName: req.file.originalname,
            originalName: req.file.originalname,
            fileSize: req.file.size,
            mimeType: req.file.mimetype,
            localPath: fileKey, // 🔥 Store fileKey instead of local path
            uploadedBy: user._id,
            reviewStatus: 'pending_review',
            status: 'active'
        });

        // ===== Handle Required Documents Logic =====
        if (documentType && !isAdditional && task.requiredDocuments?.length > 0) {
            const requiredDoc = task.requiredDocuments.find(rd => rd.type === documentType);
            if (requiredDoc) {
                requiredDoc.uploaded = true;
                requiredDoc.uploadedFiles.push({
                    documentId: taskDocument._id,
                    uploadedAt: new Date()
                });
            }
        }

        // ===== REMOVED AUTO-STATUS CHANGE =====
        // Status changes are now manual only - no automatic transitions
        // Previously: Auto-changed to PENDING_REVIEW when all docs uploaded
        // Now: User must manually change status

        task.updatedAt = new Date();
        await task.save();

        // Send notification to staff and admin
        try {
            await task.populate('clientId', 'first_name last_name email');
            await task.populate('staffId', 'first_name last_name email');
            
            const client = task.clientId;
            const staff = task.staffId;
            
            // Notify assigned staff
            if (staff) {
                await notificationHelper.notifyDocumentUploaded(taskDocument, task, client, staff);
            }
            
            // Also notify all admins only if task was created by an admin
            const assignedByUser = task.assignedBy
                ? await User.findById(task.assignedBy).select('role_id')
                : null;
            const isAssignedByAdmin = assignedByUser?.role_id === '1';
            if (isAssignedByAdmin && assignedByUser) {
                await notificationHelper.notifyDocumentUploaded(taskDocument, task, client, assignedByUser);
            }
        } catch (notifError) {
            console.error('Notification error:', notifError);
            // Don't fail the request if notification fails
        }

        res.status(200).json({
            success: true,
            message: isAdditional ? 'Additional document uploaded successfully' : 'Document uploaded successfully',
            data: {
                taskId: task._id,
                documentId: taskDocument._id,
                documentType: taskDocument.documentType,
                isAdditional: isAdditional || false
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

        // Check if all REQUIRED documents are approved
        if (task.requiredDocuments && task.requiredDocuments.length > 0) {
            const requiredTypes = task.requiredDocuments
                .filter(rd => rd.isRequired)
                .map(rd => rd.type);
            
            const allApproved = await TaskDocument.areAllApproved(task._id, requiredTypes);
            
            if (!allApproved) {
                return res.status(400).json({
                    success: false,
                    message: 'Cannot approve task - not all required documents are approved'
                });
            }
        }

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

        // Update all task documents to approved
        await TaskDocument.updateMany(
            { taskId: task._id, status: 'active' },
            {
                reviewStatus: 'approved',
                reviewedBy: user._id,
                reviewedAt: new Date(),
                reviewNotes: reviewNotes || ''
            }
        );

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

        // Update all task documents to rejected
        await TaskDocument.updateMany(
            { taskId: task._id, status: 'active' },
            {
                reviewStatus: 'rejected',
                reviewedBy: user._id,
                reviewedAt: new Date(),
                reviewNotes: rejectionReason
            }
        );

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
