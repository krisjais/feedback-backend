const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    // Generate secure randomized filename, sanitizing original extension
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const cleanExt = path.extname(file.originalname).toLowerCase().replace(/[^a-z0-9.]/g, '');
    cb(null, 'attachment-' + uniqueSuffix + cleanExt);
  },
});

// Strict Whitelist of Allowed Extensions and Corresponding MIME Types
const ALLOWED_EXTENSIONS = /^(jpe?g|png|gif|webp|pdf|docx?|txt|xlsx?|csv)$/i;

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
]);

const fileFilter = (req, file, cb) => {
  const originalName = file.originalname || '';

  // Block path traversal and null-byte injection
  if (originalName.includes('..') || originalName.includes('/') || originalName.includes('\\') || originalName.includes('\0')) {
    return cb(new Error('Invalid filename path characters detected.'));
  }

  const ext = path.extname(originalName).toLowerCase().replace('.', '');

  const isExtAllowed = ALLOWED_EXTENSIONS.test(ext);
  const isMimeAllowed = ALLOWED_MIME_TYPES.has(file.mimetype);

  if (isExtAllowed && isMimeAllowed) {
    cb(null, true);
  } else {
    cb(new Error('Unsupported or unsafe file format. Allowed: images (JPG, PNG, WebP), PDF, Word, Excel, CSV, TXT.'));
  }
};

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 5,
  },
  fileFilter,
});

module.exports = upload;
