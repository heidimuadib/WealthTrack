const express = require('express');
const { register, login, google, me, updateProfile } = require('../controllers/auth.controller');
const auth = require('../middleware/auth');

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.post('/google', google);

// These need a token, so auth is applied per-route rather than with
// router.use() — register/login/google must stay open.
router.get('/me', auth, me);
router.put('/profile', auth, updateProfile);

module.exports = router;
