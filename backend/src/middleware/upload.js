const fs = require('fs');
const path = require('path');
const multer = require('multer');

// Avatars live outside src/ — they are served as static bytes, not code, and
// nothing in the app tree should be writable at runtime.
const AVATAR_DIR = path.join(__dirname, '..', '..', 'uploads', 'avatars');
const PUBLIC_PREFIX = '/uploads/avatars/';

fs.mkdirSync(AVATAR_DIR, { recursive: true });

// The extension comes from the reported type rather than the client's filename:
// an upload announcing itself as "photo.php" must not land on disk as one.
const EXTENSIONS = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
};

// Comfortably above a phone photo scaled to 512px, well below anything that
// would fill the disk.
const MAX_BYTES = 5 * 1024 * 1024;

const unsupportedType = () => {
    const error = new Error('Unsupported image type');
    error.code = 'UNSUPPORTED_IMAGE_TYPE';
    return error;
};

const handler = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, AVATAR_DIR),
        // No part of the name is user-supplied, so an upload cannot escape the
        // directory or land on someone else's photo. The timestamp also makes
        // every save a fresh URL, which is what stops the phone from showing a
        // cached copy of the picture that was just replaced.
        filename: (req, file, cb) =>
            cb(null, `u${req.user.id}-${Date.now()}${EXTENSIONS[file.mimetype]}`),
    }),
    limits: { fileSize: MAX_BYTES, files: 1 },
    fileFilter: (req, file, cb) => {
        if (!EXTENSIONS[file.mimetype]) {
            return cb(unsupportedType());
        }
        cb(null, true);
    },
}).single('avatar');

// Multer rejects by throwing at the middleware layer, which would otherwise
// reach the generic error handler and answer 500 for what is a user mistake.
const uploadAvatar = (req, res, next) =>
    handler(req, res, (error) => {
        if (!error) {
            return next();
        }

        if (error.code === 'LIMIT_FILE_SIZE') {
            return res
                .status(400)
                .json({ error: 'That image is larger than 5 MB. Pick a smaller one.' });
        }

        if (error.code === 'UNSUPPORTED_IMAGE_TYPE') {
            return res
                .status(400)
                .json({ error: 'Only JPEG, PNG, and WebP images can be used as a photo.' });
        }

        console.error(error);
        return res.status(400).json({ error: 'Could not read that image.' });
    });

const avatarPublicUrl = (filename) => `${PUBLIC_PREFIX}${filename}`;

// Best effort: a file that outlives its row is clutter, not a failure worth
// rejecting the request over. Values come from our own column, but the path is
// rebuilt from the basename anyway so a doctored one cannot reach outside.
const deleteAvatarFile = (publicUrl) => {
    if (typeof publicUrl !== 'string' || !publicUrl.startsWith(PUBLIC_PREFIX)) {
        return;
    }

    fs.promises.unlink(path.join(AVATAR_DIR, path.basename(publicUrl))).catch(() => {});
};

module.exports = { uploadAvatar, avatarPublicUrl, deleteAvatarFile, AVATAR_DIR };
