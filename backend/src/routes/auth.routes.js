const express = require('express');
const { register, login, google, me } = require('../controllers/auth.controller');
const auth = require('../middleware/auth');

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.post('/google', google);

// Only this route needs a token, so auth is applied per-route rather than
// with router.use().
router.get('/me', auth, me);

module.exports = router;
