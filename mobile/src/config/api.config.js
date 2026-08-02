// This machine's Wi-Fi address — the phone reaches the API directly over the
// LAN, bypassing the adb reverse tunnel and its USB flakiness entirely.
// If the PC's address changes (check with `ipconfig`), update it here.
// USB-only fallback: return 'http://127.0.0.1:3000' and run `npm run tunnel`.
const LAN_IP = '192.168.1.7';

// Nginx terminates TLS in front of the API and redirects plain HTTP to it.
// Two invariants hold here, both covered by api.config.test.js:
//   - https, never http. Release builds carry no cleartext permission, so an
//     http:// value would fail every request rather than downgrade quietly.
//   - no trailing slash. Paths are joined straight onto this, and a stored
//     avatar path already begins with one.
const PRODUCTION_API_URL = 'https://wealthtrack.duckdns.org';

const getApiUrl = () => (__DEV__ ? `http://${LAN_IP}:3000` : PRODUCTION_API_URL);

export const API_URL = getApiUrl();
