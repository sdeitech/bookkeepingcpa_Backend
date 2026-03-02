const multer = require('multer');
const path = require('path');
const fs = require('fs');

/* ===============================
   PROFILE PICTURE (LOCAL)
================================= */

// Ensure upload directory exists
const profileImagesDir = path.join(__dirname, '../uploads/profile-images');

if (!fs.existsSync(profileImagesDir)) {
    fs.mkdirSync(profileImagesDir, { recursive: true });
}

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

const profilePictureFilter = (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Invalid file type.'), false);
    }
};

const uploadProfilePicture = multer({
    storage: profilePictureStorage,
    fileFilter: profilePictureFilter,
    limits: { fileSize: 5 * 1024 * 1024 }
}).single('profilePicture');


/* ===============================
   DOCUMENT UPLOAD (S3)
================================= */

// 🔥 IMPORTANT: Use memoryStorage instead of disk
const documentStorage = multer.memoryStorage();

const uploadDocument = multer({
    storage: documentStorage,
    limits: { fileSize: 10 * 1024 * 1024 }
  });


module.exports = {
    uploadProfilePicture,
    uploadDocument
};