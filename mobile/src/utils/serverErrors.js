// The API answers a 4xx with a sentence written for exactly that situation,
// and it writes them in English. Passing those straight to the screen — which
// is what happened before this file existed — put English in front of a reader
// who had chosen Filipino or Bisaya, in the one place where being understood
// matters most.
//
// Matching on prose is not the design to reach for if the API were being
// written from scratch: a stable machine-readable code per error survives
// rewording, and this map does not. It is chosen here because it needs no
// server release, and because it degrades safely — an unmapped or reworded
// message falls through as the server's own English, exactly as it did
// before. The English values in the dictionary are the API's own wording, so
// an English reader sees no change either way.
//
// Keys are the exact sentences from backend/src. When one is reworded there,
// this map is what has to follow it; the i18n test lists any entry whose key
// is missing from the dictionary, but nothing can detect a server sentence
// that no longer matches, so treat that as a manual step.
export const SERVER_MESSAGE_KEYS = {
    // 400 — the request itself was wrong
    'A valid category is required': 'server.categoryRequired',
    'Amount must be a number greater than 0': 'server.amountPositive',
    'Amount must be a number of zero or more': 'server.amountNonNegative',
    'Category name is required': 'server.categoryNameRequired',
    'Could not read that image.': 'server.imageUnreadable',
    'Email is required': 'server.emailRequired',
    'Invalid JSON body': 'server.invalidBody',
    'Invalid category id': 'server.invalidCategoryId',
    'Invalid credentials': 'server.invalidCredentials',
    'Invalid date': 'server.invalidDate',
    'Invalid expense id': 'server.invalidExpenseId',
    'Invalid month or year': 'server.invalidMonthYear',
    'Invalid year': 'server.invalidYear',
    'Missing Google token': 'server.missingGoogleToken',
    'Month must be a number from 1 to 12': 'server.invalidMonth',
    'Name is required': 'server.nameRequired',
    'Name must be 60 characters or fewer': 'server.nameTooLong',
    'No fields to update': 'server.noFields',
    'No image received': 'server.noImage',
    'Only JPEG, PNG, and WebP images can be used as a photo.': 'server.imageType',
    'Password must be at least 8 characters': 'server.passwordTooShort',
    'Password is required to delete this account': 'server.passwordRequiredForDelete',
    'That image is larger than 5 MB. Pick a smaller one.': 'server.imageTooLarge',
    'User already exists': 'server.userExists',
    'Year must be a number between 2000 and 2100': 'server.invalidYearRange',

    // 401 — the interceptor turns most of these into a logout, but a caller
    // that reads the message before the screen unmounts still shows one.
    'Access denied. No token provided.': 'server.noAuthToken',
    'Account no longer exists': 'server.accountGone',
    'Could not verify that Google account': 'server.googleUnverified',
    'Invalid or expired token.': 'server.tokenExpired',
    'That Google account has no verified email': 'server.googleNoEmail',

    // 404
    'Category not found': 'server.categoryNotFound',
    'Expense not found': 'server.expenseNotFound',

    // 409 — the API refusing to orphan expenses
    'You already have a category with that name.': 'server.categoryDuplicate',

    // 503
    'Google sign-in is not available right now.': 'server.googleUnavailable',
};

// undefined for anything unrecognised, which is the signal to fall back to the
// server's own wording rather than invent one.
export const serverMessageKey = (message) =>
    typeof message === 'string' ? SERVER_MESSAGE_KEYS[message.trim()] : undefined;
