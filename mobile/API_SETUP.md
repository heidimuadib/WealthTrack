# API Configuration Guide

How the app decides which backend URL to talk to, and what to change when it
cannot reach one. The logic lives in `src/config/api.config.js`.

## How it works

In development the app talks to `http://localhost:3000`, on both Android and
iOS. On a device or emulator, `localhost` is the device itself — `adb reverse`
is what maps it back to the machine running the backend:

```bash
npm run tunnel      # adb reverse tcp:3000 tcp:3000 and tcp:8081 tcp:8081
```

That mapping does **not** survive the cable being unplugged, the phone
sleeping, or adb restarting. It also is not restored by
`react-native run-android`, which only forwards Metro's port 8081 and never
3000. When it lapses the UI still loads from Metro's cache while every API call
fails, so re-running `npm run tunnel` is the first thing to try.

## Reaching the backend over Wi-Fi instead of USB

If you would rather not depend on the cable, set `LAN_IP` at the top of
`src/config/api.config.js` to the address of the machine running the backend:

```js
const LAN_IP = '192.168.1.100';   // null to use the adb tunnel instead
```

Find it with `ipconfig` on Windows, `ifconfig` on macOS or Linux. The phone and
that machine have to be on the same network, and the address changes whenever
the machine rejoins a different one.

Restart Metro after editing it:

```bash
npm start -- --reset-cache
```

## Production

`getApiUrl()` still returns a placeholder for non-development builds. Point it
at the real deployment before shipping anything.

## Troubleshooting

**Every request fails, the screens show "No connection"**

1. Confirm the backend is running: `npm run dev` in `backend/`, then check
   `http://localhost:3000/health` from the same machine.
2. Re-run `npm run tunnel` — this is the usual cause.
3. If you are on Wi-Fi rather than USB, check `LAN_IP` still matches the
   machine's current address.

**Changes to the config are not taking effect**

Metro caches aggressively. Stop it, then `npm start -- --reset-cache`, then
rebuild with `npm run android`.
