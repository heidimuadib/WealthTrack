import api from './api';

// Every group endpoint, in one place.
//
// Nothing here handles a token: the shared axios instance already attaches it,
// and a second implementation would be a second thing to get wrong. Nothing
// here logs either — a group is somebody's friends and what they spent, and the
// request interceptor's development logging is the only place any of it should
// ever appear.
//
// Ids are encoded on the way into a path. They are uuids today and encoding
// them changes nothing, which is exactly why it is worth doing now rather than
// after something else ends up in one.

const groupPath = (groupId) => `/groups/${encodeURIComponent(groupId)}`;
const memberPath = (groupId, memberId) =>
    `${groupPath(groupId)}/members/${encodeURIComponent(memberId)}`;
const expensePath = (groupId, expenseId) =>
    `${groupPath(groupId)}/expenses/${encodeURIComponent(expenseId)}`;
const settlementPath = (groupId, settlementId) =>
    `${groupPath(groupId)}/settlements/${encodeURIComponent(settlementId)}`;

export const groupService = {
    // `archived` is a filter, not a widening: true returns archived groups
    // only, which is what the backend documents and what a two-state toggle
    // needs. Omitted entirely when false so the query string stays clean.
    list: (archived = false) =>
        api.get('/groups', { params: archived ? { archived: 'true' } : undefined }),
    get: (groupId) => api.get(groupPath(groupId)),
    create: (data) => api.post('/groups', data),
    update: (groupId, data) => api.put(groupPath(groupId), data),
    remove: (groupId) => api.delete(groupPath(groupId)),
    archive: (groupId) => api.post(`${groupPath(groupId)}/archive`),
    unarchive: (groupId) => api.post(`${groupPath(groupId)}/unarchive`),
};

export const groupMemberService = {
    create: (groupId, data) => api.post(`${groupPath(groupId)}/members`, data),
    update: (groupId, memberId, data) => api.put(memberPath(groupId, memberId), data),
    remove: (groupId, memberId) => api.delete(memberPath(groupId, memberId)),
    archive: (groupId, memberId) => api.post(`${memberPath(groupId, memberId)}/archive`),
    unarchive: (groupId, memberId) => api.post(`${memberPath(groupId, memberId)}/unarchive`),
};

export const sharedExpenseService = {
    list: (groupId) => api.get(`${groupPath(groupId)}/expenses`),
    get: (groupId, expenseId) => api.get(expensePath(groupId, expenseId)),
    create: (groupId, data) => api.post(`${groupPath(groupId)}/expenses`, data),
    update: (groupId, expenseId, data) => api.put(expensePath(groupId, expenseId), data),
    remove: (groupId, expenseId) => api.delete(expensePath(groupId, expenseId)),
};

export const groupBalanceService = {
    get: (groupId) => api.get(`${groupPath(groupId)}/balances`),
};

export const settlementService = {
    list: (groupId) => api.get(`${groupPath(groupId)}/settlements`),
    get: (groupId, settlementId) => api.get(settlementPath(groupId, settlementId)),
    create: (groupId, data) => api.post(`${groupPath(groupId)}/settlements`, data),
    update: (groupId, settlementId, data) => api.put(settlementPath(groupId, settlementId), data),
    remove: (groupId, settlementId) => api.delete(settlementPath(groupId, settlementId)),
};
