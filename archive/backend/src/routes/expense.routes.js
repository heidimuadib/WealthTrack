const express = require('express');
const { getExpenses, createExpense, updateExpense, deleteExpense } = require('../controllers/expense.controller');
const auth = require('../middleware/auth');

const router = express.Router();

router.use(auth);

router.get('/', getExpenses);
router.post('/', createExpense);
router.put('/:id', updateExpense);
router.delete('/:id', deleteExpense);

module.exports = router;
