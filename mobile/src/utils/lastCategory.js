import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'lastCategoryId';

// Most people spend in the same few places, so the category they used last is
// far more often right than the first one alphabetically. This is what turns
// the common case into "type the amount, press save".
//
// Both sides are best effort: a preference that fails to load or save must
// never stop an expense being recorded.
export const readLastCategory = async () => {
    try {
        const stored = await AsyncStorage.getItem(KEY);
        const id = parseInt(stored, 10);
        return Number.isInteger(id) && id > 0 ? id : null;
    } catch (error) {
        return null;
    }
};

export const writeLastCategory = async (id) => {
    if (!Number.isInteger(id) || id <= 0) {
        return;
    }
    try {
        await AsyncStorage.setItem(KEY, String(id));
    } catch (error) {
        // The next add simply falls back to the first category.
    }
};
