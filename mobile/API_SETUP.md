# API Configuration Guide

How the app decides which backend URL to talk to, and what to change when it
cannot reach one. The logic lives in `src/config/api.config.js`.

## How it works

Development builds call the backend **directly over the LAN**:

```js
const LAN_IP = '192.168.1.7';   // this machine's Wi-Fi address
```

The phone and the machine running the backend must be on the same network, and
the address changes whenever the machine rejoins a different one — check with
`ipconfig` (Windows) or `ifconfig` (macOS/Linux), update `LAN_IP`, and reload.

Metro (the JS bundler) still loads over the USB cable, so after plugging in:

```bash
adb reverse tcp:8081 tcp:8081   # or: npm run tunnel
```

Release builds use `PRODUCTION_API_URL`, which is a deliberately unresolvable
placeholder until a real deployment exists — a release build fails loudly
instead of quietly talking to a developer's LAN. Release builds also refuse
cleartext HTTP (that permission is debug-only), so the production URL must be
HTTPS.

## Falling back to the USB tunnel

If LAN access is not possible (public Wi-Fi, client isolation), point
`getApiUrl()` back at `http://127.0.0.1:3000` and run `npm run tunnel`, which
maps ports 3000 and 8081 over the cable. That mapping does **not** survive the
cable being unplugged, the phone sleeping, or adb restarting — re-run it when
API calls start failing. It is also not restored by builds, which only forward
Metro's port.

## Troubleshooting

**Every request fails, the screens show "No connection"**

1. Confirm the backend is running: `npm run dev` in `backend/`, then open
   `http://localhost:3000/health` on the same machine.
2. Check `LAN_IP` still matches the machine's current address (`ipconfig`).
3. Confirm phone and machine are on the same Wi-Fi network.

**Changes to this config are not taking effect**

Metro caches aggressively, and `--reset-cache` does not always help. Stop
Metro, delete `%TEMP%\metro-cache`, then `npm start`. Verify a change actually
reached the served bundle before debugging anything else:

```powershell
Invoke-WebRequest "http://127.0.0.1:8081/index.bundle?platform=android&dev=true&minify=false" -OutFile bundle.js
Select-String "the-string-you-changed" bundle.js
```
