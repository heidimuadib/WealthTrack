#!/usr/bin/env node
/*
 * Re-establishes the adb reverse tunnels the app needs in development.
 *
 * The app talks to the API at localhost:3000 and Metro at localhost:8081 on the
 * device; `adb reverse` maps both back to this machine. Those mappings do NOT
 * survive the cable being unplugged, the phone sleeping, or adb restarting —
 * and when 3000 goes missing the UI still loads (Metro is cached) while every
 * API call fails with a generic network error. That combination is confusing to
 * debug, so this exists to make recovery one command.
 *
 * `react-native run-android` only forwards 8081, never 3000.
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PORTS = [3000, 8081];

const adbCandidates = () => {
    const sdks = [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT].filter(Boolean);
    const exe = process.platform === 'win32' ? 'adb.exe' : 'adb';

    return [
        ...sdks.map((sdk) => path.join(sdk, 'platform-tools', exe)),
        // Fall back to whatever is on PATH.
        exe,
    ];
};

const resolveAdb = () => {
    for (const candidate of adbCandidates()) {
        // The bare name is only reachable via PATH, so let exec decide on it.
        if (!path.isAbsolute(candidate)) {
            return candidate;
        }
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }
    return null;
};

const run = (adb, args) =>
    execFileSync(adb, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

const main = () => {
    const adb = resolveAdb();

    if (!adb) {
        console.error('✗ Could not find adb. Set ANDROID_HOME or add platform-tools to PATH.');
        process.exit(1);
    }

    let devices;
    try {
        devices = run(adb, ['devices'])
            .split(/\r?\n/)
            .slice(1)
            .map((line) => line.trim())
            .filter(Boolean);
    } catch (error) {
        console.error(`✗ adb failed: ${error.message}`);
        process.exit(1);
    }

    const ready = devices.filter((line) => /\tdevice$/.test(line));

    if (ready.length === 0) {
        console.error('✗ No authorised device attached.');
        if (devices.length > 0) {
            console.error(`  adb reports: ${devices.join(', ')}`);
            console.error('  "unauthorized" → tap "Allow USB debugging" on the phone.');
            console.error('  "offline"      → unplug and replug the cable.');
        } else {
            console.error('  Plug the phone in and enable USB debugging.');
        }
        process.exit(1);
    }

    const serial = ready[0].split(/\s+/)[0];

    for (const port of PORTS) {
        try {
            run(adb, ['-s', serial, 'reverse', `tcp:${port}`, `tcp:${port}`]);
            console.log(`✓ tcp:${port} → localhost:${port}`);
        } catch (error) {
            console.error(`✗ could not forward ${port}: ${error.message}`);
            process.exit(1);
        }
    }

    console.log(`\nTunnels ready on ${serial}. Backend must be running on :3000.`);
};

main();
