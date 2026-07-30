# API Configuration Guide

## Overview
The app now uses **dynamic API URL detection** instead of hardcoded values. This makes it easier to switch between development environments.

## How It Works

### Automatic Detection
The app automatically detects the correct API URL based on:
- **Platform** (Android/iOS)
- **Environment** (Development/Production)
- **Device Type** (Emulator/Physical Device)

### Default Behavior
- **Android Emulator**: `http://10.0.2.2:3000`
- **iOS Simulator**: `http://localhost:3000`
- **Physical Devices**: Uses `.env` file configuration

## Configuration

### For Physical Devices
1. Find your computer's local IP address:
   ```bash
   # Windows
   ipconfig
   
   # Mac/Linux
   ifconfig
   ```

2. Create/update `.env` file in the frontend directory:
   ```
   API_URL=http://YOUR_LOCAL_IP:3000
   ```
   
   Example:
   ```
   API_URL=http://192.168.1.100:3000
   ```

3. Restart Metro bundler:
   ```bash
   npm start -- --reset-cache
   ```

### For Emulators/Simulators
No configuration needed! The app will automatically use:
- Android: `10.0.2.2:3000`
- iOS: `localhost:3000`

## Files Modified
- `src/config/api.config.js` - Dynamic API URL configuration
- `src/services/api.js` - Uses config instead of hardcoded URL
- `babel.config.js` - Added react-native-dotenv support
- `.env` - Environment variables (gitignored)
- `.env.example` - Template for environment variables

## Troubleshooting

### App can't connect to backend
1. Verify backend is running: `npm run dev` in backend directory
2. Check your IP address hasn't changed
3. Update `.env` with new IP if needed
4. Clear Metro cache: `npm start -- --reset-cache`

### Changes not taking effect
1. Stop Metro bundler (Ctrl+C)
2. Clear cache: `npm start -- --reset-cache`
3. Rebuild app: `npx react-native run-android`
