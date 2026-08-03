// A small in-memory stand-in for the Prisma client, faithful to the parts the
// group routes actually use.
//
// A jest.fn() returning a canned row cannot fail an ownership test: it answers
// the same thing whether or not the caller remembered to put userId in the
// where clause, which is the single defect these tests exist to catch. So this
// evaluates the where clause for real — including relation filters like
// { group: { userId } } — and refuses writes that would break the unique
// constraints the schema declares, P2002 and all.
//
// What it still cannot prove is that PostgreSQL behaves the same way. The
// partial unique index, the foreign keys and transactional rollback are
// modelled here, not executed. That needs a disposable database, and none is
// reachable without reading credentials this task is not allowed to read.

// Which scalar column links a row to its parent, so a relation filter can be
// resolved without the caller spelling out a join.
const RELATIONS = {
    groupMember: { group: { model: 'expenseGroup', foreignKey: 'groupId' } },
    sharedExpense: { group: { model: 'expenseGroup', foreignKey: 'groupId' } },
    settlement: { group: { model: 'expenseGroup', foreignKey: 'groupId' } },
    sharedExpenseShare: {
        sharedExpense: { model: 'sharedExpense', foreignKey: 'sharedExpenseId' },
    },
};

// Mirrors @@unique in schema.prisma. `where` narrows the rows a constraint
// applies to, which is how the hand-written partial index is represented.
const UNIQUES = {
    expenseGroup: [{ fields: ['userId', 'name'] }],
    groupMember: [
        { fields: ['groupId', 'name'] },
        { fields: ['groupId'], where: { isCurrentUser: true } },
    ],
};

const MODELS = [
    'user',
    'expenseGroup',
    'groupMember',
    'sharedExpense',
    'sharedExpenseShare',
    'settlement',
];

const prismaError = (code) => {
    const error = new Error(`Fake Prisma error ${code}`);
    error.code = code;
    return error;
};

const createFakePrisma = () => {
    const db = Object.fromEntries(MODELS.map((model) => [model, []]));
    let sequence = 0;
    // Shaped like a real v4 uuid, because the routes validate the format before
    // they look anything up — an id of the wrong shape would be refused as a
    // malformed request and never reach the ownership check these tests exist
    // to exercise. Counter-based rather than random so failures reproduce.
    const nextId = () =>
        `00000000-0000-4000-8000-${String((sequence += 1)).padStart(12, '0')}`;

    const matches = (model, row, where = {}) =>
        Object.entries(where).every(([key, expected]) => {
            const relation = RELATIONS[model]?.[key];

            if (relation) {
                const parent = db[relation.model].find(
                    (candidate) => candidate.id === row[relation.foreignKey]
                );
                return parent ? matches(relation.model, parent, expected) : false;
            }

            if (expected && typeof expected === 'object' && 'not' in expected) {
                return row[key] !== expected.not;
            }

            return row[key] === expected;
        });

    const findAll = (model, where) => db[model].filter((row) => matches(model, row, where));

    const sortRows = (rows, orderBy) => {
        if (!orderBy) {
            return rows;
        }

        const clauses = Array.isArray(orderBy) ? orderBy : [orderBy];

        return [...rows].sort((a, b) => {
            for (const clause of clauses) {
                const [field, direction] = Object.entries(clause)[0];
                const left = a[field];
                const right = b[field];
                if (left === right) continue;
                const smaller = left < right || (left === null && right !== null) ? -1 : 1;
                return direction === 'desc' ? -smaller : smaller;
            }
            return 0;
        });
    };

    // Only the shapes the group controllers ask for: members, and a member
    // count. Anything else would be inventing behaviour to test against.
    const withInclude = (model, row, include) => {
        if (!row || !include) {
            return row;
        }

        const shaped = { ...row };

        if (include.members) {
            const members = findAll('groupMember', { groupId: row.id });
            shaped.members = sortRows(members, include.members.orderBy);
        }

        if (include._count?.select?.members) {
            shaped._count = { members: findAll('groupMember', { groupId: row.id }).length };
        }

        return shaped;
    };

    const assertUnique = (model, row, ignoreId = null) => {
        (UNIQUES[model] ?? []).forEach((constraint) => {
            if (constraint.where && !matches(model, row, constraint.where)) {
                return;
            }

            const clash = db[model].some((candidate) => {
                if (candidate.id === ignoreId) return false;
                if (constraint.where && !matches(model, candidate, constraint.where)) return false;
                return constraint.fields.every((field) => candidate[field] === row[field]);
            });

            if (clash) {
                throw prismaError('P2002');
            }
        });
    };

    const now = () => new Date('2026-08-04T00:00:00.000Z');

    const insert = (model, data) => {
        const { members, ...scalars } = data;
        const row = {
            id: scalars.id ?? nextId(),
            archivedAt: null,
            contactNote: null,
            description: null,
            color: null,
            isCurrentUser: false,
            createdAt: now(),
            updatedAt: now(),
            ...scalars,
        };

        assertUnique(model, row);
        db[model].push(row);

        // Nested create, which is how a group and its self-member are written
        // in one statement.
        if (members?.create) {
            const nested = Array.isArray(members.create) ? members.create : [members.create];
            nested.forEach((child) => insert('groupMember', { ...child, groupId: row.id }));
        }

        return row;
    };

    const delegate = (model) => ({
        findMany: jest.fn(async ({ where, orderBy, include } = {}) =>
            sortRows(findAll(model, where), orderBy).map((row) =>
                withInclude(model, row, include)
            )
        ),
        findFirst: jest.fn(async ({ where, orderBy, include } = {}) => {
            const [row] = sortRows(findAll(model, where), orderBy);
            return row ? withInclude(model, row, include) : null;
        }),
        findUnique: jest.fn(async ({ where, include, select } = {}) => {
            const row = db[model].find((candidate) =>
                Object.entries(where).every(([key, value]) => candidate[key] === value)
            );
            if (!row) return null;
            if (select) {
                return Object.fromEntries(Object.keys(select).map((key) => [key, row[key]]));
            }
            return withInclude(model, row, include);
        }),
        create: jest.fn(async ({ data, include }) =>
            withInclude(model, insert(model, data), include)
        ),
        update: jest.fn(async ({ where, data, include }) => {
            const row = db[model].find((candidate) => candidate.id === where.id);
            if (!row) throw prismaError('P2025');
            const updated = { ...row, ...data, updatedAt: now() };
            assertUnique(model, updated, row.id);
            Object.assign(row, updated);
            return withInclude(model, row, include);
        }),
        deleteMany: jest.fn(async ({ where } = {}) => {
            const doomed = findAll(model, where);
            db[model] = db[model].filter((row) => !doomed.includes(row));
            return { count: doomed.length };
        }),
        count: jest.fn(async ({ where } = {}) => findAll(model, where).length),
    });

    const client = Object.fromEntries(MODELS.map((model) => [model, delegate(model)]));

    // Both call shapes. The array form is what account deletion uses; the
    // callback form is what group creation uses. Neither rolls back here —
    // that is a database property, and its absence is stated in the report.
    client.$transaction = jest.fn(async (operations) =>
        typeof operations === 'function' ? operations(client) : Promise.all(operations)
    );

    client.__db = db;
    client.__seedUser = (id, name) => insert('user', { id, name });

    return client;
};

module.exports = { createFakePrisma };
