const express = require('express');
const {
    listGroups,
    getGroup,
    createGroup,
    updateGroup,
    archiveGroup,
    unarchiveGroup,
    deleteGroup,
} = require('../controllers/group.controller');
const {
    addMember,
    updateMember,
    archiveMember,
    unarchiveMember,
    deleteMember,
} = require('../controllers/groupMember.controller');
const {
    listExpenses,
    getExpense,
    createExpense,
    updateExpense,
    deleteExpense,
} = require('../controllers/sharedExpense.controller');
const {
    getBalances,
    listSettlements,
    getSettlement,
    createSettlement,
    updateSettlement,
    deleteSettlement,
} = require('../controllers/settlement.controller');
const auth = require('../middleware/auth');

const router = express.Router();

// Nothing here is reachable without a token, and the token is the only thing
// that says which groups exist. Applied with router.use rather than per route
// so a handler added later cannot be left open by omission.
router.use(auth);

router.get('/', listGroups);
router.post('/', createGroup);

router.get('/:groupId', getGroup);
router.put('/:groupId', updateGroup);
// Deletion is only for a group with no financial history; anything else is
// archived. Kept as separate verbs rather than folded into DELETE, so the
// destructive one cannot be reached by accident.
router.delete('/:groupId', deleteGroup);
router.post('/:groupId/archive', archiveGroup);
router.post('/:groupId/unarchive', unarchiveGroup);

router.post('/:groupId/members', addMember);
router.put('/:groupId/members/:memberId', updateMember);
router.delete('/:groupId/members/:memberId', deleteMember);
router.post('/:groupId/members/:memberId/archive', archiveMember);
router.post('/:groupId/members/:memberId/unarchive', unarchiveMember);

// Shared expenses. Balances and settlements are deliberately absent — a bill
// records what was spent, and who ends up owing whom is a separate question
// answered from these rows rather than stored alongside them.
router.get('/:groupId/expenses', listExpenses);
router.post('/:groupId/expenses', createExpense);
router.get('/:groupId/expenses/:expenseId', getExpense);
router.put('/:groupId/expenses/:expenseId', updateExpense);
router.delete('/:groupId/expenses/:expenseId', deleteExpense);

// Repayments, and the balances derived from them.
//
// Balances are their own endpoint rather than a field on the group. Group
// detail stays metadata and members; expenses, settlements and balances are
// each fetched and cached on their own, so recording a repayment invalidates
// the two things it actually changed rather than a single nested response
// carrying the whole trip.
router.get('/:groupId/balances', getBalances);

router.get('/:groupId/settlements', listSettlements);
router.post('/:groupId/settlements', createSettlement);
router.get('/:groupId/settlements/:settlementId', getSettlement);
router.put('/:groupId/settlements/:settlementId', updateSettlement);
router.delete('/:groupId/settlements/:settlementId', deleteSettlement);

module.exports = router;
