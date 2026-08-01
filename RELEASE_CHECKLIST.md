# Release Checklist

Work through this top to bottom before shipping a build to anyone.

## One-time, before the first release

- [ ] Generate a real release keystore (`keytool -genkeypair`), store it
      outside the repo, and wire it into `android/app/build.gradle`
      `signingConfigs.release` — it currently reuses the **debug** keystore.
- [ ] Register the release keystore's SHA-1 on the Android OAuth client in
      Google Cloud (project `wealthtrack-504121`), alongside the debug one, or
      Google sign-in fails in release with `DEVELOPER_ERROR`.
      Print it: `keytool -list -v -keystore <release.keystore>`.
- [ ] Rotate the Google **Web client secret** (it was shared in a chat
      session; nothing in this codebase uses it, so rotation is free).
- [ ] Deploy the backend behind HTTPS. Re-enable HSTS in
      `backend/src/index.js` (`helmet({ hsts: ... })`) once it is.
- [ ] Set `PRODUCTION_API_URL` in `mobile/src/config/api.config.js` to the
      real deployment. Release builds refuse cleartext HTTP, so it must be
      `https://`.
- [ ] Production `.env`: fresh `JWT_SECRET`, `NODE_ENV=production` (disables
      the request logger), real `DATABASE_URL`, `GOOGLE_WEB_CLIENT_ID`.

## Every release

- [ ] `git status` clean; version bumped in `mobile/android/app/build.gradle`
      (`versionCode` +1, `versionName`).
- [ ] Fresh install works: delete `mobile/node_modules`, `npm ci`
      (postinstall applies `patches/`), then a clean Gradle build. This also
      proves `android/patch_namespaces.ps1` is no longer needed — delete it
      the first time this passes.
- [ ] `cd mobile/android && .\gradlew.bat app:assembleRelease` succeeds.
- [ ] `npx eslint src` — no errors.
- [ ] Backend: `npx prisma migrate deploy` against a copy of production data
      before running it against production. Have a database backup first.
- [ ] `npm audit --omit=dev` in both packages; no high/critical findings in
      production dependencies.

## Smoke test on a real device (release APK, not debug)

- [ ] Install the release APK; app opens past the splash.
- [ ] Register a fresh account → lands on dashboard with 8 categories.
- [ ] Log out, log back in with the password.
- [ ] Continue with Google → account chooser → dashboard.
- [ ] Add an expense with centavos (e.g. ₱123.45); dashboard total updates.
- [ ] Set a budget; meter and pace marker render.
- [ ] Settings → Reports: month bars, category ranking, year total correct.
- [ ] Edit and delete the test expense; report updates.
- [ ] Airplane mode: screens show error states, not spinners; recovery works
      when connectivity returns.
- [ ] Dark mode and light mode both render correctly.

## Rollback

- App: keep the previous APK; Android permits reinstalling an older
  `versionCode` locally via `adb install -r -d`. For store distribution, keep
  the previous release track available.
- Backend: `git revert` the offending commit and redeploy. Migrations in this
  repo are additive so far; if a future one is destructive, take a
  `pg_dump` before `migrate deploy` and restore from it to roll back.
- Database: `pg_dump` before every production migration is the rollback plan.
