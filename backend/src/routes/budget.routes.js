const express = require('express');
const { getBudget, setBudget } = require('../controllers/budget.controller');
const auth = require('../middleware/auth');

const router = express.Router();

router.use(auth);

router.get('/', getBudget);
router.put('/', setBudget);
router.post('/', setBudget); // Allow POST as well for creation

module.exports = router;
