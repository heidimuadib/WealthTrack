import { useCallback, useState } from 'react';

import { methodFromServer } from '../../utils/splitMath';

// The editor's state, in one place so the add and edit screens hold it
// identically.
//
// Kept in screen state and nowhere else. A draft is somebody's friends, what
// they ate and what it cost, and none of that belongs in AsyncStorage waiting
// to be read by the next thing that opens the file.

export const emptyDraft = ({ members = [], categories = [] } = {}) => {
    const self = members.find((member) => member.isCurrentUser);
    const active = members.filter((member) => !member.archivedAt);

    return {
        description: '',
        amount: '',
        // Defaults that make the common case a single tap: you paid, everybody
        // was in on it, split evenly.
        payerMemberId: self?.id ?? active[0]?.id ?? null,
        participants: active.map((member) => member.id),
        method: 'equal',
        splitValues: {},
        categoryId: categories[0]?.id ?? null,
        date: new Date(),
        note: '',
    };
};

// Rebuilt from what the server stored, never reconstructed from the resolved
// amounts. splitInput is what was actually typed — a percentage or a weight —
// and ₱400 of ₱800 is equally 50%, a weight of 2 against 2, or a figure
// somebody entered. Guessing would quietly change what the expense claims.
export const draftFromExpense = (expense) => {
    const method = methodFromServer(expense.splitMethod);

    const splitValues = {};
    (expense.shares ?? []).forEach((share) => {
        if (method === 'fixed') {
            splitValues[share.memberId] = String(share.amount);
        } else if (share.splitInput !== null && share.splitInput !== undefined) {
            splitValues[share.memberId] = String(share.splitInput);
        }
    });

    return {
        description: expense.description ?? '',
        amount: String(expense.amount ?? ''),
        payerMemberId: expense.payerMemberId,
        participants: (expense.shares ?? []).map((share) => share.memberId),
        method,
        splitValues,
        categoryId: expense.categoryId ?? null,
        date: expense.date ? new Date(expense.date) : new Date(),
        note: expense.note ?? '',
    };
};

export const useSharedExpenseDraft = (initial) => {
    const [draft, setDraft] = useState(initial);

    const update = useCallback((patch) => {
        setDraft((current) => {
            const next = { ...current, ...patch };

            // Switching away from equal seeds nothing: an exact-amount split
            // seeded from a computed equal one would look like figures the user
            // typed, and a percentage silently turned into pesos is a different
            // expense. Blank fields say plainly that they need filling in.
            if (patch.method && patch.method !== current.method) {
                next.splitValues = {};
            }

            return next;
        });
    }, []);

    return [draft, update, setDraft];
};
