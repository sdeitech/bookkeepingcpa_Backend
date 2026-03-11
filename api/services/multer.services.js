const multer = require('multer');

/* ===============================
   PROFILE PICTURE (S3 VIA MEMORY)
================================= */

const profilePictureStorage = multer.memoryStorage();

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
