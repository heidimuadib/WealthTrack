// The keypad edits a string, not a number: "12." and "12.00" are states a user
// passes through, and parseFloat would erase both. Keeping every rule here as a
// pure transform means the keypad can be tested without rendering it, and the
// display never has to guess what was meant — each constraint is enforced at
// the keystroke rather than discovered at submit.

// Nine digits is ₱999,999,999 — beyond any real expense, and short enough that
// the figure still fits the display at its largest size.
export const MAX_INTEGER_DIGITS = 9;
export const MAX_DECIMALS = 2;

const DIGIT = /^[0-9]$/;

const integerPart = (value) =>
    value.includes('.') ? value.slice(0, value.indexOf('.')) : value;

const decimalPart = (value) =>
    value.includes('.') ? value.slice(value.indexOf('.') + 1) : '';

// key is '0'-'9', '.', or 'del'. Anything else leaves the value untouched
// rather than throwing: a keypad should never be able to crash the screen.
export const pressKey = (value, key) => {
    if (key === 'del') {
        return value.slice(0, -1);
    }

    if (key === '.') {
        if (value.includes('.')) {
            return value;
        }
        // A bare "." would parse as NaN, so the leading zero is supplied.
        return value === '' ? '0.' : `${value}.`;
    }

    if (!DIGIT.test(key)) {
        return value;
    }

    // Typing 5 after a lone 0 means five, not "05".
    if (value === '0') {
        return key;
    }

    if (value.includes('.')) {
        return decimalPart(value).length >= MAX_DECIMALS ? value : `${value}${key}`;
    }

    return integerPart(value).length >= MAX_INTEGER_DIGITS ? value : `${value}${key}`;
};

// The submit value. Null means "not a saveable amount" — empty, zero, or a
// half-typed decimal point — which is what disables the save button.
export const toAmount = (value) => {
    const parsed = parseFloat(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return null;
    }
    // Centavos only: a third decimal cannot be stored by the Decimal(12,2)
    // column. The epsilon is not superstition — 1.005 * 100 evaluates to
    // 100.49999999999999 in binary floating point, so a plain round would
    // settle a half-centavo downwards and quietly lose it.
    return Math.round((parsed + Number.EPSILON) * 100) / 100;
};

// Seeds the keypad when editing an existing expense.
export const fromAmount = (amount) => {
    if (!Number.isFinite(amount) || amount <= 0) {
        return '';
    }
    // Trailing zeros are dropped so editing ₱120.00 starts at "120" rather
    // than forcing three backspaces to change the peso figure.
    return String(Math.round(amount * 100) / 100);
};

// Grouped for reading, but only the integer side: grouping a decimal the user
// is still typing would move digits under their finger.
export const formatDisplay = (value) => {
    if (value === '') {
        return '0';
    }

    const whole = integerPart(value);
    const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

    return value.includes('.') ? `${grouped}.${decimalPart(value)}` : grouped;
};
