const Document = require('../models/documentModel');
const path = require('path');
const fs = require('fs');
const { 
  upload, 
  deleteFile, 
  createFileStream,
  uploadsDir 
} = require('../services/documentUpload.service');
const resModel = require('../lib/resModel');

const documentController = {
  /**
   * Upload single document
   * POST /api/documents/upload
   */
  uploadDocument: async (req, res) => {
    try {
      if (!req.file) {
        resModel.success = false;
        resModel.message = 'No file uploaded';
        resModel.data = null;
        return res.status(400).json(resModel);
      }

      const file = req.file;
      const userId = req.userInfo?.id;
      const { category } = req.body;

      // Validate required fields
      if (!category) {
        // Delete uploaded file if validation fails
        await deleteFile(file.path);
        resModel.success = false;
        resModel.message = 'Document category is required';
        resModel.data = null;
        return res.status(400).json(resModel);
      }

      // Extract file type from extension
      const fileExtension = path.extname(file.originalname).toLowerCase().substring(1);
      
      // Create document record
      const document = new Document({
        userId,
        fileName: file.filename,
        originalName: file.originalname,
        fileType: fileExtension,
        mimeType: file.mimetype,
        fileSize: file.size,
        category,
        status: 'active',
        localPath: file.path,
        uploadedBy: userId
      });

      await document.save();

      resModel.success = true;
      resModel.message = 'Document uploaded successfully';
      resModel.data = {
        id: document._id,
        fileName: document.originalName,
        category: document.category,
        fileSize: document.fileSize,
        uploadedAt: document.createdAt
      };
      return res.status(201).json(resModel);

    } catch (error) {
      console.error('Upload error:', error);
      // Clean up file if database save fails
      if (req.file) {
        await deleteFile(req.file.path).catch(console.error);
      }
      resModel.success = false;
      resModel.message = error.message || 'Failed to upload document';
      resModel.data = null;
      return res.status(500).json(resModel);
    }
  },

  /**
   * Upload multiple documents
   * POST /api/documents/upload-multiple
   */
  uploadMultipleDocuments: async (req, res) => {
    try {
      if (!req.files || req.files.length === 0) {
        resModel.success = false;
        resModel.message = 'No files uploaded';
        resModel.data = null;
        return res.status(400).json(resModel);
      }

      const userId = req.userInfo?.id;
      const { category } = req.body;

      if (!category) {
        // Delete all uploaded files if validation fails
        for (const file of req.files) {
          await deleteFile(file.path).catch(console.error);
        }
        resModel.success = false;
        resModel.message = 'Document category is required';
        resModel.data = null;
        return res.status(400).json(resModel);
      }

      const uploadedDocuments = [];
      const errors = [];

      for (const file of req.files) {
        try {
          const fileExtension = path.extname(file.originalname).toLowerCase().substring(1);
          
          const document = new Document({
            userId,
            fileName: file.filename,
            originalName: file.originalname,
            fileType: fileExtension,
            mimeType: file.mimetype,
            fileSize: file.size,
            category,
            status: 'active',
            localPath: file.path,
            uploadedBy: userId
          });

          await document.save();
          uploadedDocuments.push({
            id: document._id,
            fileName: document.originalName,
            status: 'success'
          });
        } catch (error) {
          errors.push({
            fileName: file.originalname,
            error: error.message
          });
          // Delete file if database save fails
          await deleteFile(file.path).catch(console.error);
        }
      }

      resModel.success = true;
      resModel.message = `${uploadedDocuments.length} documents uploaded successfully`;
      resModel.data = {
        successful: uploadedDocuments,
        failed: errors,
        total: req.files.length
      };
      return res.status(201).json(resModel);

    } catch (error) {
      console.error('Multiple upload error:', error);
      // Clean up all files on error
      if (req.files) {
        for (const file of req.files) {
          await deleteFile(file.path).catch(console.error);
        }
      }
      resModel.success = false;
      resModel.message = error.message || 'Failed to upload documents';
      resModel.data = null;
      return res.status(500).json(resModel);
    }
  },

  /**
   * Get user's documents
   * GET /api/documents
   */
  getDocuments: async (req, res) => {
    try {
      const userId = req.userInfo?.id;
      const {
        category,
        status = 'active',
        page = 1,
        limit = 20,
        search
      } = req.query;

      // Build query
      const query = {
        userId,
        status: { $ne: 'deleted' },
        deletedAt: { $exists: false }
      };

      if (category) query.category = category;
      if (status) query.status = status;
      if (search) {
        query.$or = [
          { originalName: { $regex: search, $options: 'i' } }
        ];
      }

      // Execute query with pagination
      const documents = await Document.find(query)
        .select('originalName category fileType fileSize status createdAt')
        .sort({ createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .exec();

      const count = await Document.countDocuments(query);

      resModel.success = true;
      resModel.message = 'Documents retrieved successfully';
      resModel.data = {
        documents,
        pagination: {
          total: count,
          pages: Math.ceil(count / limit),
          currentPage: parseInt(page),
          perPage: parseInt(limit)
        }
      };
      return res.status(200).json(resModel);

    } catch (error) {
      console.error('Get documents error:', error);
      resModel.success = false;
      resModel.message = error.message || 'Failed to retrieve documents';
      resModel.data = null;
      return res.status(500).json(resModel);
    }
  },

  /**
   * Get single document details
   * GET /api/documents/:documentId
   */
  getDocument: async (req, res) => {
    try {
      const { documentId } = req.params;
      const userId = req.userInfo?.id;

      const document = await Document.findOne({
        _id: documentId,
        userId,
        status: { $ne: 'deleted' }
      });

      if (!document) {
        resModel.success = false;
        resModel.message = 'Document not found';
        resModel.data = null;
        return res.status(404).json(resModel);
      }

      resModel.success = true;
      resModel.message = 'Document retrieved successfully';
      resModel.data = document;
      return res.status(200).json(resModel);

    } catch (error) {
      console.error('Get document error:', error);
      resModel.success = false;
      resModel.message = error.message || 'Failed to retrieve document';
      resModel.data = null;
      return res.status(500).json(resModel);
    }
  },

  /**
   * Download document
   * GET /api/documents/:documentId/download
   */
  downloadDocument: async (req, res) => {
    try {
      const { documentId } = req.params;
      const userId = req.userInfo?.id;

      const document = await Document.findOne({
        _id: documentId,
        $or: [
          { userId },
          { 'sharedWith.userId': userId }
        ],
        status: { $ne: 'deleted' }
      });

      if (!document) {
        resModel.success = false;
        resModel.message = 'Document not found or access denied';
        resModel.data = null;
        return res.status(404).json(resModel);
      }

      // Check if file exists
      if (!fs.existsSync(document.localPath)) {
        resModel.success = false;
        resModel.message = 'File not found on server';
        resModel.data = null;
        return res.status(404).json(resModel);
      }

      // Update access tracking
      await document.incrementAccessCount();

      // Set headers for file download
      res.setHeader('Content-Type', document.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${document.originalName}"`);
      res.setHeader('Content-Length', document.fileSize);

      // Stream the file
      const fileStream = createFileStream(document.localPath);
      fileStream.pipe(res);

    } catch (error) {
      console.error('Download error:', error);
      resModel.success = false;
      resModel.message = error.message || 'Failed to download document';
      resModel.data = null;
      return res.status(500).json(resModel);
    }
  },

  /**
   * Delete document
   * DELETE /api/documents/:documentId
   */
  deleteDocument: async (req, res) => {
    try {
      const { documentId } = req.params;
      const userId = req.userInfo?.id;

      const document = await Document.findOne({
        _id: documentId,
        userId,
        status: { $ne: 'deleted' }
      });

      if (!document) {
        resModel.success = false;
        resModel.message = 'Document not found';
        resModel.data = null;
        return res.status(404).json(resModel);
      }

      // Soft delete - mark as deleted in database
      await document.markAsDeleted(userId);

      // Optional: Also delete the physical file
      // await deleteFile(document.localPath).catch(console.error);

      resModel.success = true;
      resModel.message = 'Document deleted successfully';
      resModel.data = null;
      return res.status(200).json(resModel);

    } catch (error) {
      console.error('Delete error:', error);
      resModel.success = false;
      resModel.message = error.message || 'Failed to delete document';
      resModel.data = null;
      return res.status(500).json(resModel);
    }
  },

  /**
   * Update document details
   * PUT /api/documents/:documentId
   */
  updateDocument: async (req, res) => {
    try {
      const { documentId } = req.params;
      const userId = req.userInfo?.id;
      const { category } = req.body;

      const document = await Document.findOne({
        _id: documentId,
        userId,
        status: { $ne: 'deleted' }
      });

      if (!document) {
        resModel.success = false;
        resModel.message = 'Document not found';
        resModel.data = null;
        return res.status(404).json(resModel);
      }

      // Update category if provided
      if (category) document.category = category;

      await document.save();

      resModel.success = true;
      resModel.message = 'Document updated successfully';
      resModel.data = document;
      return res.status(200).json(resModel);

    } catch (error) {
      console.error('Update error:', error);
      resModel.success = false;
      resModel.message = error.message || 'Failed to update document';
      resModel.data = null;
      return res.status(500).json(resModel);
    }
  },

  /**
   * Get document categories
   * GET /api/documents/categories
   */
  getCategories: async (req, res) => {
    try {
      const categories = [
        { value: 'tax_returns', label: 'Tax Returns', description: 'Annual tax returns (1040, etc)' },
        { value: 'w2_forms', label: 'W-2 Forms', description: 'Employee wage statements' },
        { value: '1099_forms', label: '1099 Forms', description: 'Independent contractor income' },
        { value: 'bank_statements', label: 'Bank Statements', description: 'Monthly bank statements' },
        { value: 'profit_loss', label: 'Profit & Loss', description: 'P&L statements' },
        { value: 'balance_sheets', label: 'Balance Sheets', description: 'Company balance sheets' },
        { value: 'legal_documents', label: 'Legal Documents', description: 'Contracts and legal papers' },
        { value: 'business_license', label: 'Business License', description: 'Business licenses and permits' },
        { value: 'ein_letter', label: 'EIN Letter', description: 'IRS EIN confirmation letter' },
        { value: 'incorporation', label: 'Incorporation', description: 'Articles of incorporation' },
        { value: 'contracts', label: 'Contracts', description: 'Business contracts' },
        { value: 'invoices', label: 'Invoices', description: 'Customer invoices' },
        { value: 'receipts', label: 'Receipts', description: 'Purchase receipts' },
        { value: 'passport', label: 'Passport', description: 'Passport copy' },
        { value: 'drivers_license', label: "Driver's License", description: 'Driver license copy' },
        { value: 'ssn_card', label: 'SSN Card', description: 'Social Security card' },
        { value: 'other', label: 'Other', description: 'Other documents' }
      ];

      resModel.success = true;
      resModel.message = 'Categories retrieved successfully';
      resModel.data = categories;
      return res.status(200).json(resModel);

    } catch (error) {
      console.error('Get categories error:', error);
      resModel.success = false;
      resModel.message = error.message || 'Failed to retrieve categories';
      resModel.data = null;
      return res.status(500).json(resModel);
    }
  }
};

module.exports = documentController;