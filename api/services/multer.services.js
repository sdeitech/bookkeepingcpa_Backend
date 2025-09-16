const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure upload directories exist
const profileImagesDir = path.join(__dirname, '../uploads/profile-images');
if (!fs.existsSync(profileImagesDir)) {
    fs.mkdirSync(profileImagesDir, { recursive: true });
}

// Configure multer for profile picture uploads
const profilePictureStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, profileImagesDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        const userId = req.userInfo?.id || 'unknown';
        cb(null, `profile-${userId}-${uniqueSuffix}${ext}`);
    }
});

// File filter for profile pictures
const profilePictureFilter = (req, file, cb) => {
    // Accept only image files
    const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed.'), false);
    }
};

// Create multer upload instance for profile pictures
const uploadProfilePicture = multer({
    storage: profilePictureStorage,
    fileFilter: profilePictureFilter,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB max file size
    }
}).single('profilePicture'); // Field name in form data

// Generic file upload storage
const genericStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadPath = path.join(__dirname, '../uploads/documents');
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, `document-${uniqueSuffix}${ext}`);
    }
});

// Generic file upload
const uploadDocument = multer({
    storage: genericStorage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB max file size
    }
});

module.exports = {
    uploadProfilePicture,
    uploadDocument
};