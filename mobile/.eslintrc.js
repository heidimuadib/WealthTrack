module.exports = {
  root: true,
  extends: '@react-native',
  globals: {
    // The shared config predates ES2020, so it reports BigInt as undefined.
    // Hermes has it: the compiler shipped with this RN
    // (hermes-2023-08-07-RNv0.72.4) accepts BigInt literals and arithmetic.
    // splitMath.js needs it for the one multiplication that can exceed
    // Number.MAX_SAFE_INTEGER, which is the same guard the server applies —
    // the two allocate identically or the preview is a lie.
    BigInt: 'readonly',
  },
};
