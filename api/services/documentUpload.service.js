const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, '../../uploads/documents');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Create user-specific directory
    const userId = req.userInfo?.id || 'anonymous';
    const userDir = path.join(uploadsDir, userId);
    
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
    }
    
    cb(null, userDir);
  },
  filename: function (req, file, cb) {
    // Generate unique filename with timestamp and random string
    const uniqueSuffix = Date.now() + '-' + crypto.randomBytes(6).toString('hex');
    const fileExtension = path.extname(file.originalname);
    const fileName = `doc-${uniqueSuffix}${fileExtension}`;
    cb(null, fileName);
  }
});

// File filter for allowed file types
const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ];

  const allowedExtensions = [
    '.pdf', '.jpg', '.jpeg', '.png', 
    '.doc', '.docx', '.xls', '.xlsx'
  ];

  const fileExtension = path.extname(file.originalname).toLowerCase();
  
  if (allowedMimeTypes.includes(file.mimetype) && allowedExtensions.includes(fileExtension)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type. Allowed types: PDF, JPG, PNG, DOC, DOCX, XLS, XLSX`), false);
  }
};

// Configure multer
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max file size
    files: 10 // Max 10 files at once
  }
});

// Utility functions
const deleteFile = (filePath) => {
  return new Promise((resolve, reject) => {
    fs.unlink(filePath, (err) => {
      if (err && err.code !== 'ENOENT') {
        return reject(err);
      }
      resolve();
    });
  });
};

const ensureDirectoryExists = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

const getFileStats = (filePath) => {
  return new Promise((resolve, reject) => {
    fs.stat(filePath, (err, stats) => {
      if (err) {
        return reject(err);
      }
      resolve(stats);
    });
  });
};

// Create a read stream for file downloads
const createFileStream = (filePath) => {
  return fs.createReadStream(filePath);
};

module.exports = {
  upload,
  deleteFile,
  ensureDirectoryExists,
  getFileStats,
  createFileStream,
  uploadsDir
};