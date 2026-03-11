const TaskDocument = require('../models/taskDocumentModel');
const Task = require('../models/taskModel');
const User = require('../models/userModel');
const path = require('path');
const fs = require('fs');
const notificationHelper = require('../helpers/notificationHelper');
const { GetObjectCommand, PutObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const s3 = require('../config/s3');

const taskDocumentController = {
  /**
   * Upload standalone document (not related to any task)
   * POST /api/documents/standalone
   */
  uploadStandaloneDocument: async (req, res) => {
    try {
      const userId = req.user._id;

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'No file uploaded'
        });
      }

      // Validate file type
      const allowedTypes = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/csv',
        'text/plain',
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/gif',
        'image/webp',
        'application/zip',
        'application/x-rar-compressed'
      ];

      const allowedExtensions = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.csv', '.txt', '.jpg', '.jpeg', '.png', '.gif', '.webp', '.zip', '.rar'];
      const fileExtension = '.' + req.file.originalname.split('.').pop().toLowerCase();

      if (!allowedTypes.includes(req.file.mimetype) && !allowedExtensions.includes(fileExtension)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid file type. Please upload PDF, Word, Excel, images, or compressed files only.'
        });
      }

      // Validate file size (max 10MB)
      const maxSize = 10 * 1024 * 1024; // 10MB
      if (req.file.size > maxSize) {
        return res.status(400).json({
          success: false,
          message: 'File size must be less than 10MB'
        });
      }

      // Generate S3 file key for standalone documents
      const fileKey = `standalone-documents/${userId}/${Date.now()}-${req.file.originalname}`;

      // Upload to S3
      const command = new PutObjectCommand({
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: fileKey,
        Body: req.file.buffer,
        ContentType: req.file.mimetype,
      });

      await s3.send(command);

      // Create TaskDocument record (with taskId: null for standalone)
      const taskDocument = await TaskDocument.create({
        taskId: null, // Standalone document
        documentType: null, // No specific type for standalone
        userId: userId,
        fileName: req.file.originalname,
        originalName: req.file.originalname,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        localPath: fileKey,
        uploadedBy: userId,
        reviewStatus: 'pending_review',
        status: 'active'
      });

      return res.status(201).json({
        success: true,
        message: 'Standalone document uploaded successfully',
        data: {
          documentId: taskDocument._id,
          fileName: taskDocument.originalName,
          fileSize: taskDocument.fileSize,
          uploadedAt: taskDocument.createdAt
        }
      });

    } catch (error) {
      console.error('Upload standalone document error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to upload standalone document',
        error: error.message
      });
    }
  },

  /**
   * Get documents for a specific task
   * GET /api/task-documents/task/:taskId
   */
  getTaskDocuments: async (req, res) => {
    try {
      const { taskId } = req.params;
      const userId = req.user._id;

      // Verify task exists and user has access
      const task = await Task.findById(taskId);

      if (!task) {
        return res.status(404).json({
          success: false,
          message: 'Task not found'
        });
      }

      // Check access (admin, assigned staff, or task owner)
      const user = await User.findById(userId);
      const hasAccess =
        user.role_id === '1' || // Admin
        task.assignedTo.toString() === userId || // Assigned to user
        task.staffId?.toString() === userId || // Staff assigned to client
        task.clientId.toString() === userId; // Client

      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }

      // Get documents
      const documents = await TaskDocument.find({
        taskId,
        status: 'active'
      })
        .populate('uploadedBy', 'first_name last_name email')
        .populate('reviewedBy', 'first_name last_name email')
        .sort({ createdAt: -1 });

      return res.status(200).json({
        success: true,
        message: 'Documents retrieved successfully',
        data: documents
      });

    } catch (error) {
      console.error('Get task documents error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve documents',
        error: error.message
      });
    }
  },


  getAllDocuments: async (req, res) => {
    try {
      const userId = req.user._id;
  
      const {
        status = "all",
        search = "",
        fromDate,
        toDate,
        page = 1,
        limit = 12,
        clientId,
        type = "all", // all, task-related, standalone
        includeDeleted = "false", // New filter for deleted tasks
      } = req.query;

      // Convert includeDeleted to boolean for consistent comparison
      const shouldIncludeDeleted = includeDeleted === true || includeDeleted === "true";
  
      const pageNumber = Math.max(parseInt(page) || 1, 1);
      const limitNumber = Math.min(Math.max(parseInt(limit) || 12, 1), 100);
  
      // ================= AUTH =================
      const user = await User.findById(userId).select("role_id");
  
      if (!user) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized",
        });
      }
      
      const isAdmin = user.role_id === "1";
      const isStaff = user.role_id === "2";
      const isClient = user.role_id === "3";
  
      if (!isAdmin && !isStaff && !isClient) {
        return res.status(403).json({
          success: false,
          message: "Access denied",
        });
      }
  
      // ================= FILTER =================
  
      const filter = {
        status: "active",
      };
  
      // 🔐 ROLE BASED ACCESS CONTROL
      if (isAdmin) {
        // Admin can filter by client
        if (clientId) {
          filter.userId = clientId;
        }
      } else if (isStaff) {
        // Staff can only see documents from their assigned clients
        // This needs to be implemented based on your staff-client assignment logic
        filter.userId = userId; // For now, staff sees their own documents
      } else {
        // Client can ONLY see their documents
        filter.userId = userId;
      }

      // 🔥 NEW: Document type filter
      if (type === "task-related") {
        filter.taskId = { $ne: null }; // Documents with taskId
      } else if (type === "standalone") {
        filter.taskId = null; // Documents without taskId
      }
      // type === "all" shows both task-related and standalone
  
      // Status filter
      if (status !== "all") {
        filter.reviewStatus = status;
      }
  
      // Date filter
      if (fromDate || toDate) {
        filter.createdAt = {};
  
        if (fromDate) {
          filter.createdAt.$gte = new Date(`${fromDate}T00:00:00.000Z`);
        }
  
        if (toDate) {
          filter.createdAt.$lte = new Date(`${toDate}T23:59:59.999Z`);
        }
      }
  
      // Search filter
      if (search.trim()) {
        filter.$or = [
          { fileName: { $regex: search, $options: "i" } },
          { originalName: { $regex: search, $options: "i" } },
          { documentType: { $regex: search, $options: "i" } },
        ];
      }

      // Debug logging (after filter is fully constructed)
      console.log('📋 Documents Query Debug:', {
        includeDeleted: includeDeleted,
        shouldIncludeDeleted: shouldIncludeDeleted,
        type: typeof includeDeleted,
        filter: filter,
        userId: userId,
        userRole: user.role_id
      });
  
      // ================= QUERY =================

      // Build aggregation pipeline to handle deleted task filtering
      const pipeline = [
        // Match documents based on basic filters
        { $match: filter },
        
        // Lookup task information (including deleted tasks)
        {
          $lookup: {
            from: "tasks",
            localField: "taskId",
            foreignField: "_id",
            as: "taskInfo"
          }
        },
        
        // Add computed fields for task status
        {
          $addFields: {
            taskDeleted: {
              $cond: {
                if: { $eq: ["$taskId", null] },
                then: false, // Standalone documents are not deleted
                else: {
                  $ifNull: [
                    { $arrayElemAt: ["$taskInfo.deleted", 0] },
                    false
                  ]
                }
              }
            }
          }
        },
        
        // Filter based on includeDeleted parameter
        ...(!shouldIncludeDeleted ? [
          {
            $match: {
              $or: [
                { taskId: null }, // Include standalone documents
                { taskDeleted: false } // Include documents from non-deleted tasks
              ]
            }
          }
        ] : []),
        
        // Sort by creation date
        { $sort: { createdAt: -1 } },
        
        // Pagination
        { $skip: (pageNumber - 1) * limitNumber },
        { $limit: limitNumber },
        
        // Lookup related data
        {
          $lookup: {
            from: "tasks",
            let: { taskId: "$taskId" },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ["$_id", "$$taskId"] }
                }
              },
              {
                $project: {
                  title: 1,
                  deleted: 1,
                  deletedAt: 1,
                  deletedBy: 1,
                  status: 1
                }
              }
            ],
            as: "taskId"
          }
        },
        {
          $lookup: {
            from: "users",
            let: { uploadedBy: "$uploadedBy" },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ["$_id", "$$uploadedBy"] }
                }
              },
              {
                $project: {
                  first_name: 1,
                  last_name: 1,
                  email: 1
                }
              }
            ],
            as: "uploadedBy"
          }
        },
        {
          $lookup: {
            from: "users",
            let: { reviewedBy: "$reviewedBy" },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ["$_id", "$$reviewedBy"] }
                }
              },
              {
                $project: {
                  first_name: 1,
                  last_name: 1,
                  email: 1
                }
              }
            ],
            as: "reviewedBy"
          }
        },
        
        // Flatten single-item arrays
        {
          $addFields: {
            taskId: { $arrayElemAt: ["$taskId", 0] },
            uploadedBy: { $arrayElemAt: ["$uploadedBy", 0] },
            reviewedBy: { $arrayElemAt: ["$reviewedBy", 0] }
          }
        }
      ];

      // Count total items with same filtering logic
      const countPipeline = [
        { $match: filter },
        {
          $lookup: {
            from: "tasks",
            localField: "taskId",
            foreignField: "_id",
            as: "taskInfo"
          }
        },
        {
          $addFields: {
            taskDeleted: {
              $cond: {
                if: { $eq: ["$taskId", null] },
                then: false,
                else: {
                  $ifNull: [
                    { $arrayElemAt: ["$taskInfo.deleted", 0] },
                    false
                  ]
                }
              }
            }
          }
        },
        ...(!shouldIncludeDeleted ? [
          {
            $match: {
              $or: [
                { taskId: null },
                { taskDeleted: false }
              ]
            }
          }
        ] : []),
        { $count: "total" }
      ];

      const [documents, countResult] = await Promise.all([
        TaskDocument.aggregate(pipeline),
        TaskDocument.aggregate(countPipeline)
      ]);

      const totalItems = countResult[0]?.total || 0;
      
      // Debug logging
      console.log('📋 Documents Query Results:', {
        totalItems: totalItems,
        documentsCount: documents.length,
        shouldIncludeDeleted: shouldIncludeDeleted
      });

      // Fallback: If aggregation returns no results, try simple query for debugging
      if (documents.length === 0) {
        console.log('⚠️ Aggregation returned no results, trying simple query...');
        const simpleCount = await TaskDocument.countDocuments(filter);
        console.log('📊 Simple query count:', simpleCount);
        
        if (simpleCount > 0) {
          console.log('🔍 Documents exist but aggregation failed. Using simple query as fallback.');
          let fallbackDocuments = await TaskDocument.find(filter)
            .populate({
              path: "taskId", 
              select: "title deleted deletedAt deletedBy status",
            })
            .populate("uploadedBy", "first_name last_name email")
            .populate("reviewedBy", "first_name last_name email")
            .sort({ createdAt: -1 })
            .skip((pageNumber - 1) * limitNumber)
            .limit(limitNumber)
            .lean();
          
          // Apply deleted task filtering if includeDeleted is false
          if (!shouldIncludeDeleted) {
            fallbackDocuments = fallbackDocuments.filter(doc => {
              // Include standalone documents (no taskId)
              if (!doc.taskId) return true;
              // Include documents from non-deleted tasks
              return !doc.taskId.deleted;
            });
          }
          
          // Recalculate count after filtering
          let filteredCount = simpleCount;
          if (!shouldIncludeDeleted) {
            // Count documents that would pass the deleted task filter
            const allDocuments = await TaskDocument.find(filter)
              .populate({
                path: "taskId", 
                select: "deleted",
              })
              .lean();
            
            filteredCount = allDocuments.filter(doc => {
              if (!doc.taskId) return true;
              return !doc.taskId.deleted;
            }).length;
          }
          
          return res.status(200).json({
            success: true,
            message: "Documents retrieved successfully (fallback query)",
            data: {
              documents: fallbackDocuments,
              pagination: {
                totalItems: filteredCount,
                totalPages: Math.ceil(filteredCount / limitNumber),
                currentPage: pageNumber,
                perPage: limitNumber,
              },
              role: isAdmin ? "admin" : isStaff ? "staff" : "client",
              filters: {
                type,
                status,
                search,
                fromDate,
                toDate,
                clientId,
                includeDeleted: shouldIncludeDeleted
              }
            },
          });
        }
      }
  
      const totalPages =
        totalItems === 0 ? 0 : Math.ceil(totalItems / limitNumber);
  
      return res.status(200).json({
        success: true,
        message: "Documents retrieved successfully",
        data: {
          documents,
          pagination: {
            totalItems,
            totalPages,
            currentPage: pageNumber,
            perPage: limitNumber,
          },
          role: isAdmin ? "admin" : isStaff ? "staff" : "client",
          filters: {
            type,
            status,
            search,
            fromDate,
            toDate,
            clientId,
            includeDeleted: shouldIncludeDeleted
          }
        },
      });
    } catch (error) {
      console.error("Get documents error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve documents",
        error: error.message,
      });
    }
  },


  /**
   * Approve a document or undo approval
   * PATCH /api/task-documents/:documentId/approve
   * Body: { reviewNotes: string, undo: boolean }
   */
  approveDocument: async (req, res) => {
    try {
      const { documentId } = req.params;
      const { reviewNotes, undo = false } = req.body;
      const userId = req.user._id;

      const document = await TaskDocument.findById(documentId);

      if (!document) {
        return res.status(404).json({
          success: false,
          message: 'Document not found'
        });
      }

      // Verify user has permission to approve (admin or staff assigned to client)
      const user = await User.findById(userId);
      const task = await Task.findById(document.taskId);

      if (!task) {
        return res.status(404).json({
          success: false,
          message: 'Associated task not found'
        });
      }

      // Only admin or staff assigned to this client can approve
      const isAdmin = user.role_id === '1';
      const isAssignedStaff = user.role_id === '2' && (
        task.staffId?.toString() === userId ||
        user.assignedClients?.some(clientId => clientId.toString() === task.clientId.toString())
      );

      if (!isAdmin && !isAssignedStaff) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to approve this document'
        });
      }

      // Handle undo action
      if (undo) {
        // Reset to pending review
        document.reviewStatus = 'pending_review';
        document.reviewedBy = null;
        document.reviewedAt = null;
        document.reviewNotes = null;
        await document.save();

        return res.status(200).json({
          success: true,
          message: 'Document approval undone successfully',
          data: document
        });
      }

      // Approve document
      await document.approve(userId, reviewNotes || '');

      // Check if all required documents are now approved
      if (task.requiredDocuments) {
        const requiredTypes = task.requiredDocuments
          .filter(rd => rd.isRequired)
          .map(rd => rd.type);

        const allApproved = await TaskDocument.areAllApproved(task._id, requiredTypes);

        // Auto-complete task if all required docs approved
        if (allApproved && task.status === 'PENDING_REVIEW') {
          task.status = 'COMPLETED';
          task.completedAt = new Date();
          task.statusHistory.push({
            status: 'COMPLETED',
            changedBy: userId,
            changedAt: new Date(),
            notes: 'All required documents approved'
          });
          await task.save();
        }
      }

      // Send notification to client
      try {
        await task.populate('clientId', 'first_name last_name email');
        const client = task.clientId;
        const reviewer = await User.findById(userId);
        
        if (client && reviewer) {
          await notificationHelper.notifyDocumentApproved(document, task, client, reviewer);
        }
      } catch (notifError) {
        console.error('Notification error:', notifError);
        // Don't fail the request if notification fails
      }

      return res.status(200).json({
        success: true,
        message: 'Document approved successfully',
        data: document
      });

    } catch (error) {
      console.error('Approve document error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to approve document',
        error: error.message
      });
    }
  },

  /**
   * Reject a document or undo rejection
   * PATCH /api/task-documents/:documentId/reject
   * Body: { rejectionReason: string, undo: boolean }
   */
  rejectDocument: async (req, res) => {
    try {
      const { documentId } = req.params;
      const { rejectionReason, undo = false } = req.body;
      const userId = req.user._id;

      const document = await TaskDocument.findById(documentId);

      if (!document) {
        return res.status(404).json({
          success: false,
          message: 'Document not found'
        });
      }

      // Verify user has permission to reject (admin or staff assigned to client)
      const user = await User.findById(userId);
      const task = await Task.findById(document.taskId);

      if (!task) {
        return res.status(404).json({
          success: false,
          message: 'Associated task not found'
        });
      }

      // Only admin or staff assigned to this client can reject
      const isAdmin = user.role_id === '1';
      const isAssignedStaff = user.role_id === '2' && (
        task.staffId?.toString() === userId ||
        user.assignedClients?.some(clientId => clientId.toString() === task.clientId.toString())
      );

      if (!isAdmin && !isAssignedStaff) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to reject this document'
        });
      }

      // Handle undo action
      if (undo) {
        // Reset to pending review
        document.reviewStatus = 'pending_review';
        document.reviewedBy = null;
        document.reviewedAt = null;
        document.reviewNotes = null;
        await document.save();

        return res.status(200).json({
          success: true,
          message: 'Document rejection undone successfully',
          data: document
        });
      }

      // Validate rejection reason for actual rejection
      if (!rejectionReason) {
        return res.status(400).json({
          success: false,
          message: 'Rejection reason is required'
        });
      }

      // Reject document
      await document.reject(userId, rejectionReason);

      // Update task status to NEEDS_REVISION
      if (task.status !== 'NEEDS_REVISION') {
        task.status = 'NEEDS_REVISION';
        task.statusHistory.push({
          status: 'NEEDS_REVISION',
          changedBy: userId,
          changedAt: new Date(),
          notes: `Document rejected: ${rejectionReason}`
        });
        await task.save();
      }

      // Send notification to client
      try {
        await task.populate('clientId', 'first_name last_name email');
        const client = task.clientId;
        const reviewer = await User.findById(userId);
        
        if (client && reviewer) {
          await notificationHelper.notifyDocumentRejected(document, task, client, reviewer, rejectionReason);
        }
      } catch (notifError) {
        console.error('Notification error:', notifError);
        // Don't fail the request if notification fails
      }

      return res.status(200).json({
        success: true,
        message: 'Document rejected successfully',
        data: document
      });

    } catch (error) {
      console.error('Reject document error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to reject document',
        error: error.message
      });
    }
  },

  /**
   * Download document
   * GET /api/task-documents/:documentId/download
   */
  downloadDocument: async (req, res) => {
    try {
      const { documentId } = req.params;
      const userId = req.user._id;
      const user = req.user; // Add missing user variable
  
      const document = await TaskDocument.findById(documentId);
  
      if (!document || document.status === "deleted") {
        return res.status(404).json({
          success: false,
          message: "Document not found",
        });
      }
  
      // 🔐 Permission Check - Enhanced for standalone documents
      let hasAccess = false;
      
      if (document.taskId) {
        // Task-related document - check task permissions
        const task = await Task.findById(document.taskId);
        if (task) {
          hasAccess =
            user.role_id === "1" || // Admin
            task.assignedTo?.toString() === userId.toString() ||
            task.staffId?.toString() === userId.toString() ||
            task.clientId?.toString() === userId.toString();
        }
      } else {
        // Standalone document - check ownership
        hasAccess =
          user.role_id === "1" || // Admin can access all
          document.userId?.toString() === userId.toString(); // Owner can access
      }
  
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: "Access denied",
        });
      }
  
      // 🔥 Get File From S3
      const command = new GetObjectCommand({
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: document.localPath, // This should store S3 key
      });
  
      const s3Response = await s3.send(command);
  
      // Set headers for forced download
      res.setHeader("Content-Type", document.mimeType);
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${document.originalName}"`
      );
      res.setHeader("Content-Length", document.fileSize);
  
      // Stream S3 file directly to client
      s3Response.Body.pipe(res);
  
    } catch (error) {
      console.error("Download error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to download document",
        error: error.message,
      });
    }
  },
  /**
   * View document (inline display for viewer)
   * GET /api/task-documents/:documentId/view?auth=token
   */
  viewDocument: async (req, res) => {
    try {
      const { documentId } = req.params;

      // Get user ID from auth middleware (req.user) or from query token
      let userId = req.user?._id;
      let user = req.user; // Initialize user variable

      // If no user from middleware, try to get from query token
      if (!userId && req.query.auth) {
        const jwt = require('jsonwebtoken');
        try {
          const decoded = jwt.verify(req.query.auth, process.env.JWT_SECRET);
          userId = decoded.id;
          // Get user from database when using token auth
          user = await User.findById(userId).select('role_id');
        } catch (error) {
          return res.status(401).json({
            success: false,
            message: 'Invalid or expired token'
          });
        }
      }

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      const document = await TaskDocument.findById(documentId);

      if (!document || document.status === 'deleted') {
        return res.status(404).json({
          success: false,
          message: 'Document not found'
        });
      }

      // Verify access - Enhanced for standalone documents
      let hasAccess = false;
      let task = null;
      
      if (document.taskId) {
        // Task-related document
        task = await Task.findById(document.taskId);
        if (task) {
          hasAccess =
            user.role_id === '1' || // Admin
            task.assignedTo?.toString() === userId || // Assigned to user
            task.staffId?.toString() === userId || // Staff
            task.clientId?.toString() === userId; // Client
        }
      } else {
        // Standalone document - check ownership
        hasAccess =
          user.role_id === '1' || // Admin can access all
          document.userId?.toString() === userId; // Owner can access
      }

      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }

      // Check if file exists
      if (!fs.existsSync(document.localPath)) {
        return res.status(404).json({
          success: false,
          message: 'File not found on server'
        });
      }

      // Set headers for inline viewing
      res.setHeader('Content-Type', document.mimeType);
      res.setHeader('Content-Disposition', `inline; filename="${document.originalName}"`);
      res.setHeader('Content-Length', document.fileSize);
      // Allow embedding in iframes
      res.setHeader('X-Frame-Options', 'SAMEORIGIN');
      // Cache for 1 hour
      res.setHeader('Cache-Control', 'private, max-age=3600');

      // Stream the file
      const fileStream = fs.createReadStream(document.localPath);
      fileStream.pipe(res);

    } catch (error) {
      console.error('View error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to view document',
        error: error.message
      });
    }
  },

  /**
   * Delete document (soft delete)
   * DELETE /api/task-documents/:documentId
   */
  deleteDocument: async (req, res) => {
    try {
      const { documentId } = req.params;
      const userId = req.user._id;

      const document = await TaskDocument.findById(documentId);

      if (!document || document.status === 'deleted') {
        return res.status(404).json({
          success: false,
          message: 'Document not found'
        });
      }

      // Soft delete
      await document.markAsDeleted(userId);

      return res.status(200).json({
        success: true,
        message: 'Document deleted successfully'
      });

    } catch (error) {
      console.error('Delete error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to delete document',
        error: error.message
      });
    }
  },


  getDocumentUrl: async (req, res) => {
    try {
      const { documentId } = req.params;
      const user = req.user;

      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }
  
      const document = await TaskDocument.findById(documentId);
    
  
      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }
  
      // 🔐 Permission Rules
      const isAdmin = user.role === "ADMIN";
      const isOwner = document.userId.toString() === user._id.toString();
  
      if (!isAdmin && !isOwner) {
        return res.status(403).json({ message: "Unauthorized access" });
      }
  
      const command = new GetObjectCommand({
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: document.localPath,
      });
  
      const signedUrl = await getSignedUrl(s3, command, {
        expiresIn: 600 //10 mins
      });
  
      res.json({
        signedUrl,
        expiresAt: Date.now() + 600 * 1000 // 10 mins in ms
      });
  
    } catch (error) {
      console.error("Signed URL error:", error);
      res.status(500).json({ message: "Failed to generate URL" });
    }
  }
};

module.exports = taskDocumentController;
