jest.mock('../api', () => {
    const record = (method) =>
        jest.fn((url, ...rest) => Promise.resolve({ data: { method, url, rest } }));

    return {
        __esModule: true,
        default: {
            get: record('get'),
            post: record('post'),
            put: record('put'),
            delete: record('delete'),
        },
    };
});

import api from '../api';
import {
    groupService,
    groupMemberService,
    sharedExpenseService,
    groupBalanceService,
    settlementService,
} from '../groups';

const GROUP = 'aaaaaaaa-0000-4000-8000-000000000001';
const MEMBER = 'bbbbbbbb-0000-4000-8000-000000000002';
const EXPENSE = 'cccccccc-0000-4000-8000-000000000003';
const SETTLEMENT = 'dddddddd-0000-4000-8000-000000000004';

beforeEach(() => {
    ['get', 'post', 'put', 'delete'].forEach((method) => api[method].mockClear());
});

const urlOf = (method) => api[method].mock.calls[0][0];

describe('paths', () => {
    it.each([
        ['groups.get', () => groupService.get(GROUP), 'get', `/groups/${GROUP}`],
        ['groups.update', () => groupService.update(GROUP, {}), 'put', `/groups/${GROUP}`],
        ['groups.remove', () => groupService.remove(GROUP), 'delete', `/groups/${GROUP}`],
        ['groups.archive', () => groupService.archive(GROUP), 'post', `/groups/${GROUP}/archive`],
        [
            'groups.unarchive',
            () => groupService.unarchive(GROUP),
            'post',
            `/groups/${GROUP}/unarchive`,
        ],
        [
            'members.create',
            () => groupMemberService.create(GROUP, {}),
            'post',
            `/groups/${GROUP}/members`,
        ],
        [
            'members.update',
            () => groupMemberService.update(GROUP, MEMBER, {}),
            'put',
            `/groups/${GROUP}/members/${MEMBER}`,
        ],
        [
            'members.remove',
            () => groupMemberService.remove(GROUP, MEMBER),
            'delete',
            `/groups/${GROUP}/members/${MEMBER}`,
        ],
        [
            'members.archive',
            () => groupMemberService.archive(GROUP, MEMBER),
            'post',
            `/groups/${GROUP}/members/${MEMBER}/archive`,
        ],
        [
            'members.unarchive',
            () => groupMemberService.unarchive(GROUP, MEMBER),
            'post',
            `/groups/${GROUP}/members/${MEMBER}/unarchive`,
        ],
        [
            'expenses.list',
            () => sharedExpenseService.list(GROUP),
            'get',
            `/groups/${GROUP}/expenses`,
        ],
        [
            'expenses.get',
            () => sharedExpenseService.get(GROUP, EXPENSE),
            'get',
            `/groups/${GROUP}/expenses/${EXPENSE}`,
        ],
        [
            'expenses.create',
            () => sharedExpenseService.create(GROUP, {}),
            'post',
            `/groups/${GROUP}/expenses`,
        ],
        [
            'expenses.update',
            () => sharedExpenseService.update(GROUP, EXPENSE, {}),
            'put',
            `/groups/${GROUP}/expenses/${EXPENSE}`,
        ],
        [
            'expenses.remove',
            () => sharedExpenseService.remove(GROUP, EXPENSE),
            'delete',
            `/groups/${GROUP}/expenses/${EXPENSE}`,
        ],
        [
            'balances.get',
            () => groupBalanceService.get(GROUP),
            'get',
            `/groups/${GROUP}/balances`,
        ],
        [
            'settlements.list',
            () => settlementService.list(GROUP),
            'get',
            `/groups/${GROUP}/settlements`,
        ],
        [
            'settlements.get',
            () => settlementService.get(GROUP, SETTLEMENT),
            'get',
            `/groups/${GROUP}/settlements/${SETTLEMENT}`,
        ],
        [
            'settlements.create',
            () => settlementService.create(GROUP, {}),
            'post',
            `/groups/${GROUP}/settlements`,
        ],
        [
            'settlements.update',
            () => settlementService.update(GROUP, SETTLEMENT, {}),
            'put',
            `/groups/${GROUP}/settlements/${SETTLEMENT}`,
        ],
        [
            'settlements.remove',
            () => settlementService.remove(GROUP, SETTLEMENT),
            'delete',
            `/groups/${GROUP}/settlements/${SETTLEMENT}`,
        ],
    ])('%s hits the right path', async (_label, invoke, method, expected) => {
        await invoke();
        expect(urlOf(method)).toBe(expected);
    });

    it('lists active groups without a query string', async () => {
        await groupService.list();
        expect(api.get).toHaveBeenCalledWith('/groups', { params: undefined });
    });

    it('asks for archived groups explicitly', async () => {
        await groupService.list(true);
        expect(api.get).toHaveBeenCalledWith('/groups', { params: { archived: 'true' } });
    });

    it('encodes ids on the way into a path', async () => {
        await groupService.get('a b/c');
        expect(urlOf('get')).toBe('/groups/a%20b%2Fc');
    });
});

describe('conventions', () => {
    it('goes through the shared authenticated client', () => {
        // No second token implementation, and no bare fetch: the request
        // interceptor on that instance is what attaches the session.
        const source = require('fs').readFileSync(
            require('path').join(__dirname, '..', 'groups.js'),
            'utf8'
        );

        expect(source).toMatch(/import api from '\.\/api'/);
        expect(source).not.toMatch(/\bfetch\(|Authorization|getState\(\)/);
    });

    it('logs nothing at all', async () => {
        // A group is somebody's friends and what they spent. The only place any
        // of it may appear is the dev-only interceptor in api.js.
        const source = require('fs').readFileSync(
            require('path').join(__dirname, '..', 'groups.js'),
            'utf8'
        );
        expect(source).not.toMatch(/console\./);

        const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        await groupService.create({ name: 'Bohol Laag' });
        expect(spy).not.toHaveBeenCalled();
        expect(warn).not.toHaveBeenCalled();
        spy.mockRestore();
        warn.mockRestore();
    });

    it('returns the response the way the other services do', async () => {
        const response = await groupService.list();
        expect(response).toHaveProperty('data');
    });
});
