const PESO = '₱';

// Intl is unreliable across Android JS engines, so group digits by hand.
const groupThousands = (whole) => whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

export const formatCurrency = (value, { decimals = 2, sign = false } = {}) => {
    const amount = Number(value) || 0;
    const isNegative = amount < 0;
    const fixed = Math.abs(amount).toFixed(decimals);
    const [whole, fraction] = fixed.split('.');

    let out = `${PESO}${groupThousands(whole)}`;
    if (fraction) {
        out += `.${fraction}`;
    }

    if (isNegative) {
        return `-${out}`;
    }
    return sign ? `+${out}` : out;
};

// Drops the centavos for headline figures where they only add noise.
export const formatCompact = (value) => formatCurrency(value, { decimals: 0 });

// Headline figures set the symbol and the centavos at their own size, so they
// need the parts rather than one string. Truncates rather than rounds the peso
// part, so the whole and the fraction always describe the same amount.
export const splitCurrency = (value) => {
    const amount = Number(value) || 0;
    const [whole, fraction] = Math.abs(amount).toFixed(2).split('.');

    return {
        sign: amount < 0 ? '-' : '',
        symbol: PESO,
        whole: groupThousands(whole),
        fraction: `.${fraction}`,
    };
};

const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];

const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3));

export const monthName = (month) => MONTHS[month - 1] || '';
export const monthNameShort = (month) => MONTHS_SHORT[month - 1] || '';

export const formatMonthYear = (month, year) => `${monthName(month)} ${year}`;

export const formatDate = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return '';
    }
    return `${MONTHS_SHORT[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
};

export const formatDayLabel = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return '';
    }

    const today = new Date();
    const isSameDay = (a, b) =>
        a.getDate() === b.getDate() &&
        a.getMonth() === b.getMonth() &&
        a.getFullYear() === b.getFullYear();

    if (isSameDay(date, today)) {
        return 'Today';
    }

    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    if (isSameDay(date, yesterday)) {
        return 'Yesterday';
    }

    return formatDate(value);
};

export const currentMonthYear = () => {
    const now = new Date();
    return { month: now.getMonth() + 1, year: now.getFullYear() };
};

export const shiftMonth = ({ month, year }, delta) => {
    // Date normalises overflow for us, so December + 1 rolls the year.
    const d = new Date(year, month - 1 + delta, 1);
    return { month: d.getMonth() + 1, year: d.getFullYear() };
};

export const isFutureMonth = ({ month, year }) => {
    const now = currentMonthYear();
    return year > now.year || (year === now.year && month > now.month);
};
