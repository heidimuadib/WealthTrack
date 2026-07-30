import { Platform } from 'react-native';

// Set this only if you need to reach the backend over Wi-Fi instead of USB
// (find it with `ipconfig`). Leave null to use the adb reverse tunnel.
const LAN_IP = null;

const getApiUrl = () => {
  if (__DEV__) {
    if (LAN_IP) {
      return `http://${LAN_IP}:3000`;
    }

    // `adb reverse tcp:3000 tcp:3000` maps localhost on the device to this
    // machine, which works for both USB-connected phones and emulators, and
    // survives the laptop changing networks.
    if (Platform.OS === 'android') {
      return 'http://localhost:3000';
    }

    if (Platform.OS === 'ios') {
      return 'http://localhost:3000';
    }
  }

  // TODO: point this at the real deployment before shipping.
  return 'https://your-production-api.com';
};

export const API_URL = getApiUrl();
