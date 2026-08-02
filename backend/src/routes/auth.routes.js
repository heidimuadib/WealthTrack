const express = require('express');
const {
    register,
    login,
    google,
    me,
    updateProfile,
    setAvatar,
    removeAvatar,
    deleteAccount,
} = require('../controllers/auth.controller');
const auth = require('../middleware/auth');
const { uploadAvatar } = require('../middleware/upload');

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.post('/google', google);

// These need a token, so auth is applied per-route rather than with
// router.use() — register/login/google must stay open.
router.get('/me', auth, me);
router.put('/profile', auth, updateProfile);

// auth runs before the upload so the filename can be keyed to the account, and
// so an unauthenticated request is turned away before anything reaches disk.
router.post('/avatar', auth, uploadAvatar, setAvatar);
router.delete('/avatar', auth, removeAvatar);

// No :id, by design. The account deleted is whichever one the token names, so
// there is no parameter an attacker could substitute.
router.delete('/account', auth, deleteAccount);

module.exports = router;
