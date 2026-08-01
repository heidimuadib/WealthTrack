import { Platform } from 'react-native';

// This machine's Wi-Fi address — the phone reaches the API directly over the
// LAN, bypassing the adb reverse tunnel and its USB flakiness entirely.
// If the PC's address changes (check with `ipconfig`), update it here.
// USB-only fallback: return 'http://127.0.0.1:3000' and run `npm run tunnel`.
const LAN_IP = '192.168.1.7';

// Deliberately unresolvable until a real deployment exists: a release build
// pointed here fails loudly instead of quietly talking to a developer's LAN.
const PRODUCTION_API_URL = 'https://api.wealthtrack.invalid/CHANGE-ME-BEFORE-RELEASE';

const getApiUrl = () => (__DEV__ ? `http://${LAN_IP}:3000` : PRODUCTION_API_URL);

export const API_URL = getApiUrl();
