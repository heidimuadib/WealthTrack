# Production Readiness Report

**Audit date:** 2026-08-01
**Branch:** `chore/production-readiness-cleanup` (8 feature commits landed on `main` first)
**Scope:** full repository — `backend/` (Express + Prisma + Postgres) and `mobile/` (React Native 0.72.7, Android)

---

## Decision

**READY WITH CONDITIONS**

The application is functionally complete and internally sound: it builds, installs, runs, and every API surface passes a live smoke test. It is **not yet deployable to real users**, because it has no production backend, no release signing identity, and a deliberately unresolvable production API URL. None of those are defects — they are the deployment work that has not been done yet, and each is a discrete, well-understood task.

**Confidence: High** for everything verified by execution (build, API behaviour, release-bundle contents, dependency state). **Medium** for runtime breadth, because the project has no automated tests — confidence there rests on manual device testing, not a suite.

---

## Executive summary

The audit found no critical functional defects and no leaked secrets. It did find three genuine security issues, all fixed during this pass:

1. **The dev request logger printed passwords in plaintext** to the server terminal. Now redacted, and the logger is disabled entirely when `NODE_ENV=production`.
2. **Debug logging shipped in release builds** — every request, response, and session event, including who signed in. Now behind `__DEV__`, verified absent from the release bundle.
3. **A developer's LAN address was the API URL in every build.** Release builds now use a separate placeholder and refuse cleartext HTTP; verified absent from the release bundle.

Dependency posture improved materially: **backend production dependencies went from 4 vulnerabilities (1 high, 3 moderate) to zero**, and the mobile `axios` high-severity advisory was cleared. The remaining mobile advisories are React Native 0.72 transitives whose only fix is a major framework upgrade — accepted and documented rather than attempted.

Repository hygiene: ten build logs were tracked in git, an SQLite database file lingered in a Postgres project, and a node_modules hand-patch that the Android build silently depends on evaporated on every `npm install`. All three are resolved.

---

## Checks passed

| Check | Result |
| --- | --- |
| Debug build (`gradlew app:installDebug`) | ✅ succeeds, installs on device |
| **Release build** (`gradlew app:assembleRelease`) | ✅ succeeds — 23.3 MB APK |
| ESLint (`npx eslint src`) | ✅ 0 errors (6 warnings, all pre-existing RN navigator idioms) |
| Backend boots | ✅ after Express 4.18→4.22 upgrade |
| `GET /health` | ✅ `ok` |
| `POST /auth/login` | ✅ 200, token issued |
| `GET /auth/me` | ✅ correct profile |
| `GET /categories` | ✅ 8 seeded categories |
| `POST /expenses` → `GET /reports/summary` → `DELETE` | ✅ create/aggregate/delete round-trip, total exact (₱12.34) |
| Auth guard (unauthenticated `/expenses`) | ✅ 401 |
| Google sign-in | ✅ verified end to end earlier this session (`POST /auth/google` → 200) |
| Prisma migration state | ✅ 3 migrations, `Database schema is up to date` |
| Release bundle secrets scan | ✅ no LAN IP, no debug logging, no session tracing |
| Backend prod dependency audit | ✅ 0 vulnerabilities |

---

## Critical blockers

**None.** Nothing found would corrupt data, expose a secret, or break a core flow in its current (development) deployment.

---

## High-priority issues

These block a *public release*, not day-to-day use. All are itemised in `RELEASE_CHECKLIST.md`.

1. **Release builds are signed with the debug keystore.** `signingConfigs.release` points at `debug.keystore`, whose private key ships publicly inside React Native. Anyone can forge an update to this app. Generate a real keystore, store it outside the repo, and register its SHA-1 with Google or sign-in breaks in release.
2. **No production backend.** The API has no deployment target, runs plain HTTP, and has HSTS disabled in helmet for that reason. Deploy behind HTTPS, then re-enable HSTS.
3. **`PRODUCTION_API_URL` is a placeholder.** Intentionally unresolvable so a release build fails loudly rather than silently addressing a developer's LAN. Must be set to the real deployment.
4. **Google Web client secret should be rotated.** It was shared into a chat session. Nothing in this codebase uses it (ID-token verification needs only the client ID), so rotation costs nothing.

---

## Medium-priority improvements

1. **No automated tests.** `jest` is configured and `npm test` exits 1 with "No tests found". The highest-value first tests: `splitCurrency`/`formatCurrency` (money formatting), the report aggregation endpoint, and the auth controller's account-linking branches.
2. **React Native 0.72.7 carries 2 critical / 12 high transitive advisories.** The only fix is a major upgrade (0.86.x). Given this project's Gradle fragility, that is a planned project, not a cleanup item.
3. **No error tracking or structured logging.** Console logging is now dev-only, which means production has *no* observability. Add Sentry (or equivalent) plus a structured logger before real users exist.
4. **`android/patch_namespaces.ps1` is now redundant** but retained deliberately — delete it once a clean `npm ci` + Gradle build proves patch-package covers everything it was silently fixing.
5. **`backend/wealthtrack.sql`** predates the migration history. Kept as a reference dump; consider removing to avoid confusion about the source of truth.

---

## Low-priority improvements

1. Six ESLint warnings — React Navigation's `tabBarIcon` render-prop idiom. Framework-conventional; suppressing them would be noisier than leaving them.
2. Prettier disagrees with the codebase's 4-space style across ~800 sites. Either adopt the config or delete it; today it is decorative. **Not** auto-fixed — an 800-site reformat would bury real changes.
3. No pagination on `GET /expenses`. Fine at personal scale; revisit past a few thousand rows.
4. iOS is unconfigured for the custom fonts (no `Info.plist` entries) and untested generally.

---

## Changes completed

**Security**
- Redacted `password`/`token`/`idToken` from the backend request logger; logger now disabled when `NODE_ENV=production`.
- Gated all 17 mobile console statements behind `__DEV__` across 5 files.
- Moved `usesCleartextTraffic` + network security config from the main manifest to the **debug** manifest — release builds now refuse plain HTTP.
- Split dev/production API URLs; production is a fail-loud placeholder.
- Session lifetime moved to `JWT_EXPIRES_IN` (default 7d) — was a hardcoded 1h with no refresh flow.
- Password login against a Google-only account previously reached `bcrypt.compare(pw, null)` (500 + existence leak); now fails as an ordinary invalid credential.
- Applied `npm audit fix` to backend production dependencies (Express 4.18.2 → 4.22.2, clearing a high-severity `path-to-regexp` ReDoS).
- Upgraded `axios` 1.13.2 → 1.19.0, clearing its high-severity advisory.

**Correctness / build reliability**
- Removed the `Connection: close` + `socket.destroy()` hack from every response — a workaround for a misdiagnosed bug that cost a TCP handshake per request.
- Adopted **patch-package**: the `react-native-linear-gradient` namespace fix now lives in `patches/` and applies automatically on install, instead of existing only inside `node_modules`. Also de-duplicated the `namespace` line, which had been applied four times.

**Repository hygiene**
- 8 logical feature commits on `main` covering the session's work (Babel fix, dashboard, auth, Google sign-in, reports, design pass), then 4 cleanup commits on the branch.

---

## Files removed

| File | Reason | Evidence | Risk |
| --- | --- | --- | --- |
| `mobile/android/clean_log*.txt` (10 files) | Gradle console dumps, committed by accident | Not referenced by any script or config; content is build noise | None — now gitignored |
| `backend/prisma/dev.db` | SQLite artifact in a Postgres-only project | `schema.prisma` declares `provider = "postgresql"`; nothing opens it | None |
| `mobile/.env` | Single `API_URL` key nothing reads | No `react-native-config`/`dotenv` in mobile deps; `api.config.js` hardcodes the URL | None |
| `mobile/GRADLE_BUILD_FIXES.md` | Superseded troubleshooting notes | Content extracted into `README.md`; the fixes it recommended are now implemented | None |

## Files moved or renamed

None. Folder structure already follows React Native and Express conventions (`components/`, `screens/`, `hooks/`, `services/`, `store/`, `theme/`, `utils/`; `controllers/`, `routes/`, `middleware/`, `lib/`). Reorganising would have created churn without benefit.

## Dependencies removed or updated

| Package | Change | Reason |
| --- | --- | --- |
| `pg` (backend) | **removed** | Zero imports; Prisma bundles its own driver |
| `express` (backend) | 4.18.2 → **4.22.2** | Clears high-severity `path-to-regexp` ReDoS + 3 moderates |
| `axios` (mobile) | 1.13.2 → **1.19.0** | Clears high-severity advisory |
| `patch-package` (mobile) | **added** (devDependency) | Makes the Android build reproducible across installs |
| `google-auth-library` (backend) | **added** | Server-side Google ID token verification |
| `@react-native-google-signin/google-signin` | **added** @10.1.2 | Pinned: v11+ requires newer AGP than this project's 7.4.2 |

---

## Tests and commands run

| Command | Result |
| --- | --- |
| `git log --oneline` | 12 commits added, tree clean |
| `npx eslint src` (mobile) | 0 errors, 6 warnings |
| `npx jest` (mobile) | **FAIL — "No tests found"**, 184 files checked, 0 matches |
| `gradlew app:installDebug` | BUILD SUCCESSFUL (1m 20s), installed on device |
| `gradlew app:assembleRelease` | BUILD SUCCESSFUL (6m 42s), 23.3 MB APK |
| `npm audit --omit=dev` (backend) | before: 1 high / 3 moderate → **after: 0** |
| `npm audit --omit=dev` (mobile) | before: 2 critical / 14 high → after: 2 critical / 12 high (RN transitives) |
| `npx prisma migrate status` | "Database schema is up to date", 3 migrations |
| API smoke: health, login, me, categories, expense CRUD, report, 401 guard | **all pass** |
| Release bundle grep (LAN IP / logging / placeholder) | **all pass** |

> `npx jest` failing is reported as a genuine failure, not smoothed over. It is a *coverage* gap, not a regression — there were never any tests.

---

## Security review

**No secrets are committed.** `.gitignore` covers `.env`, `*.pem`, `*.key`, `*.jks`, `*.keystore` (with a deliberate `!debug.keystore` exception, which is correct — that key is public by design). `backend/.env` is untracked; only `.env.example` is versioned, with names and explanations but no values.

**Authentication and authorisation are sound.** JWT with a boot-time `JWT_SECRET` check that exits rather than starting insecure. bcrypt cost 10. Login returns an identical generic error for unknown-user and wrong-password, so it does not leak account existence. Every data route sits behind `router.use(auth)` and scopes queries by `req.user.id`; `ownsCategory()` blocks attaching expenses to another user's category — no IDOR found. Google ID tokens are verified server-side against Google's keys with an audience check, and unverified emails are refused.

**Rate limiting** is applied tightly to credential routes (10 failures / 15 min, successes not counted) and loosely API-wide.

**Remaining exposure:** the JWT is stored in plain AsyncStorage rather than the Android keystore — a 7-day token readable on a rooted or backed-up device. `allowBackup="false"` mitigates the backup path. Worth moving to `react-native-keychain`, bundled with the next native change.

**Note:** registration still returns "User already exists", which does leak account existence. Left deliberately — the UX cost of a vague message on a personal-finance signup outweighs the enumeration risk here, and login (the attackable surface) is already generic.

---

## Performance review

Money aggregation moved from the client to Postgres (`SUM` over `Decimal`), which closed both a precision bug and an N-request pattern — the year view is one query pair instead of twelve month fetches plus JS summing. React Query caches per month/year with targeted invalidation, so mutations refresh exactly the affected views. The dashboard's added "last month" query is deliberate and cached.

Indexes match the access patterns: `@@index([userId, date])` on Expense (the month-scoped list), `@@index([userId])` on Category, unique constraints on `[userId, name]` and `[userId, month, year]`. The report's `GROUP BY` over a year of one user's rows is served by the same composite index.

Removing the per-response `socket.destroy()` eliminated a forced TCP handshake on every single request.

---

## Database review

Three ordered, reproducible migrations (`0_init` → `money_as_decimal_and_indexes` → `google_signin`), all additive; none destructive. `migration_lock.toml` pins the provider to postgresql. Money is `Decimal(12,2)` throughout — the correct choice, and now respected end to end.

Foreign keys are declared on every relation. Referential integrity is enforced at the application layer too (category deletion returns 409 while expenses reference it, rather than orphaning rows).

`wealthtrack.sql` is a pre-migration reference dump, not part of the migration path — flagged above as a possible removal.

**No seed data ships to production.** Default categories are created per-account inside the registration transaction, which is correct behaviour rather than a seed.

---

## Deployment review

`.gitignore` is comprehensive and correctly written for a monorepo (no leading slashes, so rules apply at both `backend/` and `mobile/` depth). `.env.example` documents every variable, values omitted. `/health` exists for liveness checks.

Missing for a real deployment: a host/platform, a CI pipeline, error tracking, log aggregation, a backup schedule, and any store listing. `RELEASE_CHECKLIST.md` now carries the full sequence including the rollback plan.

---

## Manual testing still required

Automated coverage cannot substitute for these; run them from `RELEASE_CHECKLIST.md` against a **release** APK on a real device:

1. Register → dashboard shows 8 categories.
2. Log out → log back in with password.
3. Continue with Google → chooser → dashboard.
4. Add an expense with centavos; confirm dashboard and report totals.
5. Set a budget; confirm meter and pace marker.
6. Reports: month bars, category ranking, year total.
7. Edit + delete an expense; confirm report updates.
8. Airplane mode: error states appear, recovery works.
9. Light and dark mode.

---

## Recommended deployment steps

1. Rotate the Google Web client secret.
2. Generate a release keystore; store it outside the repo; wire into `signingConfigs.release`; register its SHA-1 in Google Cloud.
3. Provision Postgres; take a `pg_dump` baseline.
4. Deploy the backend behind HTTPS with `NODE_ENV=production` and a fresh `JWT_SECRET`; re-enable HSTS.
5. Run `npx prisma migrate deploy` against a copy of production data first, then production.
6. Set `PRODUCTION_API_URL` to the HTTPS deployment.
7. `gradlew app:assembleRelease`; run the full smoke list on the release APK.
8. Ship; watch error rates.

## Rollback plan

- **App:** retain the previous APK; reinstall locally with `adb install -r -d`, or roll back the store track.
- **Backend:** `git revert` and redeploy. Migrations to date are additive, so reverting code does not require reverting schema.
- **Database:** `pg_dump` before every `migrate deploy` — that dump is the rollback.

---

## Final recommendation

**Ship it to yourself first.** The codebase is in good shape: the architecture is clean, money handling is now exact end to end, the security issues found were real and are fixed, and both debug and release builds succeed. What stands between this and a public release is not code quality — it is four pieces of deployment identity (keystore, HTTPS host, production URL, rotated secret), each concrete and none requiring redesign.

Do the keystore and backend deployment next; add tests for the money-formatting and report-aggregation paths while that infrastructure work is in flight. Then this is a genuine **READY TO SHIP**.
