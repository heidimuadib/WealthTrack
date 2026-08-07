// The split preview, computed on the phone so the breakdown updates as the
// user types rather than after a round trip.
//
// This deliberately mirrors backend/src/lib/groupMoney.js rather than inventing
// a second way of dividing a bill. If the two disagreed, the screen would show
// one set of figures and the server would store another — and the user would
// only find out by opening the expense again afterwards. The rule is the same
// largest-remainder allocation, with the same tie-break on member id, and the
// tests hold both against the same worked examples.
//
// Everything is integer centavos. A peso is never a float here: 0.1 + 0.2 is
// not 0.3, and three shares of a ₱100 bill added back up as floats do not make
// ₱100.

const MAX_CENTAVOS = 999999999999;
const PERCENT_SCALE = 10000;
const FULL_PERCENT = 100 * PERCENT_SCALE;

const MONEY_PATTERN = /^(-?)(\d+)(?:\.(\d{1,2}))?$/;
const PERCENT_PATTERN = /^(\d+)(?:\.(\d{1,4}))?$/;

const isSafeInteger = (value) => typeof value === 'number' && Number.isSafeInteger(value);

// null rather than a throw: these run on every keystroke, and a half-typed
// "12." is a state the user passes through rather than an error to report.
export const toCentavos = (value) => {
    if (value === null || value === undefined || value === '') {
        return null;
    }
    if (typeof value === 'number' && !Number.isFinite(value)) {
        return null;
    }

    const match = MONEY_PATTERN.exec(String(value).trim());
    if (!match) {
        return null;
    }

    const [, sign, whole, fraction = ''] = match;
    const centavos = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));

    if (!Number.isSafeInteger(centavos) || centavos > MAX_CENTAVOS) {
        return null;
    }

    return sign === '-' ? -centavos : centavos;
};

// A decimal string, which is what the API takes for money. Never a number —
// the value must not pass through a double on its way to the request.
export const fromCentavos = (centavos) => {
    if (!isSafeInteger(centavos)) {
        return '0.00';
    }

    const sign = centavos < 0 ? '-' : '';
    const absolute = Math.abs(centavos);

    return `${sign}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, '0')}`;
};

// Percentages carry four decimal places, so a third of a bill can be written as
// 33.3333 and three of them still add to exactly 100. Scaled to integers for
// the same reason money is.
export const toScaledPercent = (value) => {
    if (value === null || value === undefined || value === '') {
        return null;
    }

    const match = PERCENT_PATTERN.exec(String(value).trim());
    if (!match) {
        return null;
    }

    const [, whole, fraction = ''] = match;
    const scaled = Number(whole) * PERCENT_SCALE + Number(fraction.padEnd(4, '0'));

    return Number.isSafeInteger(scaled) && scaled <= FULL_PERCENT ? scaled : null;
};

export const fromScaledPercent = (scaled) =>
    (scaled / PERCENT_SCALE).toFixed(4).replace(/\.?0+$/, '') || '0';

// The one allocation every weighted split goes through. Each participant gets
// the whole part of their exact share; the centavos left over — always fewer
// than there are participants — go to whoever was cut by the most, ties broken
// by member id so the same input always produces the same answer.
//
// BigInt for the multiplication, because that is the one place this overflows:
// the largest storable bill times a percentage weight is far past
// Number.MAX_SAFE_INTEGER. Everything coming back out is bounded by the total.
export const allocateByWeights = (totalCentavos, entries) => {
    if (!isSafeInteger(totalCentavos) || totalCentavos <= 0 || !Array.isArray(entries)) {
        return null;
    }

    const totalWeight = entries.reduce((sum, entry) => sum + (entry.weight ?? 0), 0);
    if (!isSafeInteger(totalWeight) || totalWeight <= 0) {
        return null;
    }

    const total = BigInt(totalCentavos);
    const weightSum = BigInt(totalWeight);

    const allocated = entries
        .map(({ memberId, weight }) => {
            const exact = total * BigInt(weight);
            return {
                memberId,
                amountCentavos: Number(exact / weightSum),
                shortfall: exact % weightSum,
            };
        })
        .sort((a, b) => {
            if (a.shortfall !== b.shortfall) {
                return a.shortfall > b.shortfall ? -1 : 1;
            }
            return a.memberId < b.memberId ? -1 : a.memberId > b.memberId ? 1 : 0;
        });

    let remaining = totalCentavos - allocated.reduce((sum, e) => sum + e.amountCentavos, 0);

    allocated.forEach((entry) => {
        if (remaining > 0) {
            entry.amountCentavos += 1;
            remaining -= 1;
        }
    });

    return allocated
        .map(({ memberId, amountCentavos }) => ({ memberId, amountCentavos }))
        .sort((a, b) => (a.memberId < b.memberId ? -1 : a.memberId > b.memberId ? 1 : 0));
};

export const splitEqual = (totalCentavos, memberIds) =>
    allocateByWeights(
        totalCentavos,
        (memberIds ?? []).map((memberId) => ({ memberId, weight: 1 }))
    );

// How many participants are carrying an extra centavo, so the screen can
// explain it only when there is something to explain.
export const remainderCount = (totalCentavos, count) => {
    if (!isSafeInteger(totalCentavos) || !isSafeInteger(count) || count <= 0) {
        return 0;
    }
    return totalCentavos - Math.floor(totalCentavos / count) * count;
};

// --- the four editors' previews ------------------------------------------
//
// Each returns { shares, status } where status says whether the split is
// submittable and, when it is not, by how much it misses. Nothing is ever
// adjusted to make it fit: a bill that is ₱5 short is a question for the person
// splitting it, and answering it silently is how an app ends up disagreeing
// with the people using it.

export const previewEqual = (totalCentavos, memberIds) => {
    const shares = splitEqual(totalCentavos, memberIds);

    return {
        shares: shares ?? [],
        status: shares ? { kind: 'ok' } : { kind: 'invalid' },
        extraCentavos: shares ? remainderCount(totalCentavos, memberIds.length) : 0,
    };
};

export const previewFixed = (totalCentavos, entries) => {
    const shares = [];
    let assigned = 0;
    let complete = true;

    entries.forEach(({ memberId, value }) => {
        const centavos = toCentavos(value);
        if (centavos === null || centavos < 0) {
            // An empty field is "not filled in yet", not "zero".
            complete = complete && (value === '' || value === undefined || value === null);
            shares.push({ memberId, amountCentavos: centavos ?? 0 });
            if (centavos !== null && centavos < 0) {
                complete = false;
            }
            return;
        }
        assigned += centavos;
        shares.push({ memberId, amountCentavos: centavos });
    });

    const difference = totalCentavos - assigned;

    return {
        shares,
        assignedCentavos: assigned,
        differenceCentavos: difference,
        status:
            !isSafeInteger(totalCentavos) || totalCentavos <= 0
                ? { kind: 'invalid' }
                : difference === 0 && complete
                  ? { kind: 'ok' }
                  : difference > 0
                    ? { kind: 'under', centavos: difference }
                    : difference < 0
                      ? { kind: 'over', centavos: -difference }
                      : { kind: 'invalid' },
    };
};

export const previewPercentage = (totalCentavos, entries) => {
    // A field nobody has typed in yet is not a mistake, so it contributes
    // nothing and the running remainder keeps counting down — the same reading
    // an exact-amount split gives. Something typed that is not a percentage is
    // a mistake, and stops the arithmetic rather than being read as zero.
    const scaled = entries.map(({ memberId, value }) => {
        const blank = value === '' || value === undefined || value === null;
        return {
            memberId,
            weight: blank ? 0 : toScaledPercent(value),
            blank,
        };
    });

    const anyInvalid = scaled.some((entry) => entry.weight === null);
    const anyBlank = scaled.some((entry) => entry.blank);
    const assigned = scaled.reduce((sum, entry) => sum + (entry.weight ?? 0), 0);
    const difference = FULL_PERCENT - assigned;

    const complete = !anyInvalid && !anyBlank;
    const shares = complete && difference === 0 ? allocateByWeights(totalCentavos, scaled) : null;

    return {
        shares: shares ?? scaled.map(({ memberId }) => ({ memberId, amountCentavos: 0 })),
        assignedScaled: assigned,
        remainingScaled: difference,
        // A blank field left at exactly 100 across the others would otherwise
        // read as agreed, and quietly hand somebody a ₱0 share of a bill they
        // were put on. It stays unsaveable until every figure is deliberate.
        status: anyInvalid
            ? { kind: 'invalid' }
            : difference > 0
              ? { kind: 'under', scaled: difference }
              : difference < 0
                ? { kind: 'over', scaled: -difference }
                : shares
                  ? { kind: 'ok' }
                  : { kind: 'invalid' },
    };
};

export const previewShares = (totalCentavos, entries) => {
    const weights = entries.map(({ memberId, value }) => {
        const trimmed = String(value ?? '').trim();
        const weight = /^\d+$/.test(trimmed) ? Number(trimmed) : null;
        return { memberId, weight };
    });

    const anyInvalid = weights.some((entry) => entry.weight === null);
    const totalWeight = weights.reduce((sum, entry) => sum + (entry.weight ?? 0), 0);
    const shares = !anyInvalid && totalWeight > 0 ? allocateByWeights(totalCentavos, weights) : null;

    return {
        shares: shares ?? weights.map(({ memberId }) => ({ memberId, amountCentavos: 0 })),
        totalWeight,
        status: anyInvalid || totalWeight <= 0 ? { kind: 'invalid' } : shares ? { kind: 'ok' } : { kind: 'invalid' },
    };
};

// What the API expects for each method. The shape differs per method, which is
// why it is built in one place rather than at the call site.
export const buildParticipants = (method, entries) => {
    if (method === 'equal') {
        return entries.map(({ memberId }) => ({ memberId }));
    }
    if (method === 'fixed') {
        return entries.map(({ memberId, value }) => ({
            memberId,
            amount: fromCentavos(toCentavos(value) ?? 0),
        }));
    }
    if (method === 'percentage') {
        return entries.map(({ memberId, value }) => ({
            memberId,
            percentage: String(value ?? '').trim(),
        }));
    }
    return entries.map(({ memberId, value }) => ({
        memberId,
        shares: Number(String(value ?? '').trim()),
    }));
};

export const SPLIT_METHODS = ['equal', 'fixed', 'percentage', 'shares'];

// The enum the API answers with, back to the key this screen works in.
export const methodFromServer = (splitMethod) =>
    ({ EQUAL: 'equal', CUSTOM: 'fixed', PERCENTAGE: 'percentage', SHARES: 'shares' })[
        splitMethod
    ] ?? 'equal';

export { MAX_CENTAVOS, PERCENT_SCALE, FULL_PERCENT };
