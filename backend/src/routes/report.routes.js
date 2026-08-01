const express = require('express');
const { summary } = require('../controllers/report.controller');
const auth = require('../middleware/auth');

const router = express.Router();

router.use(auth);

router.get('/summary', summary);

module.exports = router;
