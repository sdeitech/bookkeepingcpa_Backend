const TaskDocument = require('../models/taskDocumentModel');
const Task = require('../models/taskModel');
const User = require('../models/userModel');
const path = require('path');
const fs = require('fs');

const taskDocumentController = {
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
      } = req.query;
  
      const pageNumber = Math.max(parseInt(page) || 1, 1);
      const limitNumber = Math.min(Math.max(parseInt(limit) || 12, 1), 100);
  
      // ✅ Check user
      const user = await User.findById(userId);
  
      if (!user) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized",
        });
      }
  
      // ✅ Admin only
      if (user.role_id !== "1") {
        return res.status(403).json({
          success: false,
          message: "Access denied. Admin only.",
        });
      }
  
      // ================= FILTER BUILD =================
  
      let filter = { status: "active" };
  
      // Status filter
      if (status !== "all") {
        filter.reviewStatus = status;
      }
  
      // Date filter
      if (fromDate || toDate) {
        filter.createdAt = {};
        if (fromDate) {
          filter.createdAt.$gte = new Date(fromDate);
        }
        if (toDate) {
          filter.createdAt.$lte = new Date(toDate);
        }
      }
  
      // Search filter
      if (search) {
        filter.$or = [
          { fileName: { $regex: search, $options: "i" } },
          { originalName: { $regex: search, $options: "i" } },
          { documentType: { $regex: search, $options: "i" } },
        ];
      }
  
      // ================= COUNT =================
  
      const totalItems = await TaskDocument.countDocuments(filter);
      const totalPages =
        totalItems === 0 ? 0 : Math.ceil(totalItems / limitNumber);
  
      // ================= FETCH =================
  
      const documents = await TaskDocument.find(filter)
        .populate("taskId", "title")
        .populate("uploadedBy", "first_name last_name email")
        .populate("reviewedBy", "first_name last_name email")
        .sort({ createdAt: -1 })
        .skip((pageNumber - 1) * limitNumber)
        .limit(limitNumber);
  
      return res.status(200).json({
        success: true,
        message: "All documents retrieved successfully",
        data: {
          documents,
          pagination: {
            totalItems,
            totalPages,
            currentPage: pageNumber,
            perPage: limitNumber,
          },
          filters: {
            status,
            search,
            fromDate,
            toDate,
          },
        },
      });
    } catch (error) {
      console.error("Get all documents error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve documents",
        error: error.message,
      });
    }
  },


  /**
   * Approve a document
   * PATCH /api/task-documents/:documentId/approve
   */
  approveDocument: async (req, res) => {
    try {
      const { documentId } = req.params;
      const { reviewNotes } = req.body;
      const userId = req.user._id;

      const document = await TaskDocument.findById(documentId);

      if (!document) {
        return res.status(404).json({
          success: false,
          message: 'Document not found'
        });
      }



      // Approve document
      await document.approve(userId, reviewNotes || '');

   

      // Check if all required documents are now approved
      const task = await Task.findById(document.taskId);
      if (task && task.requiredDocuments) {
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
   * Reject a document
   * PATCH /api/task-documents/:documentId/reject
   */
  rejectDocument: async (req, res) => {
    try {
      const { documentId } = req.params;
      const { rejectionReason } = req.body;
      const userId = req.user._id;

      if (!rejectionReason) {
        return res.status(400).json({
          success: false,
          message: 'Rejection reason is required'
        });
      }

      const document = await TaskDocument.findById(documentId);

      if (!document) {
        return res.status(404).json({
          success: false,
          message: 'Document not found'
        });
      }

      // Reject document
      await document.reject(userId, rejectionReason);

      // Update task status to NEEDS_REVISION
      const task = await Task.findById(document.taskId);
      if (task && task.status !== 'NEEDS_REVISION') {
        task.status = 'NEEDS_REVISION';
        task.statusHistory.push({
          status: 'NEEDS_REVISION',
          changedBy: userId,
          changedAt: new Date(),
          notes: `Document rejected: ${rejectionReason}`
        });
        await task.save();
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

      const document = await TaskDocument.findById(documentId);

      if (!document || document.status === 'deleted') {
        return res.status(404).json({
          success: false,
          message: 'Document not found'
        });
      }

      // Verify access
      const task = await Task.findById(document.taskId);
      const user = await User.findById(userId);
      
      const hasAccess = 
        user.role_id === '1' || // Admin
        task.assignedTo.toString() === userId || // Assigned to user
        task.staffId?.toString() === userId || // Staff
        task.clientId.toString() === userId; // Client

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

      // Set headers for file download
      res.setHeader('Content-Type', document.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${document.originalName}"`);
      res.setHeader('Content-Length', document.fileSize);

      // Stream the file
      const fileStream = fs.createReadStream(document.localPath);
      fileStream.pipe(res);

    } catch (error) {
      console.error('Download error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to download document',
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
  }
};

module.exports = taskDocumentController;
