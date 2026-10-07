// backend/middleware/upload.js
const multer = require('multer');
const path = require('path');

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB - images are stored in MongoDB

// File filter to accept only images
const fileFilter = (req, file, cb) => {
  const allowedExtensions = /^\.(jpeg|jpg|png|gif|webp)$/;
  const allowedMimeTypes = /^image\/(jpeg|png|gif|webp)$/;
  const extname = allowedExtensions.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedMimeTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  }
  cb(new Error('Only image files are allowed (jpeg, jpg, png, gif, webp)'));
};

// Keep uploads in memory: serverless hosts have no writable disk
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter
});

// Turn multer errors into clean 400 responses (must follow the upload middleware)
const handleUploadError = (err, req, res, next) => {
  if (!err) return next();
  const message = err.code === 'LIMIT_FILE_SIZE'
    ? 'Image is too large. Maximum size is 2MB.'
    : err.message || 'Invalid upload';
  res.status(400).json({ success: false, message });
};

module.exports = upload;
module.exports.handleUploadError = handleUploadError;
