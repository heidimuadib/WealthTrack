# WealthTrack

A personal expense tracker for Philippine peso (₱) spending — log expenses
against categories, set a monthly budget, and see where the money went, with
a yearly report by month and category.

```
WealthTrack/
├── backend/   Express + Prisma API backed by Postgres
└── mobile/    React Native app (Android / iOS)
```

## Requirements

- Node.js 18+
- PostgreSQL 14+
- JDK 17 and the Android SDK (for the Android build), or Xcode (for iOS)

## Backend

```bash
cd backend
npm install
cp .env.example .env
```

Fill in `.env`:

| Variable | What it is |
| --- | --- |
| `DATABASE_URL` | Postgres connection string |
| `JWT_SECRET` | Token signing key — generate a fresh one, see below |
| `JWT_EXPIRES_IN` | Session lifetime (default `7d`) |
| `GOOGLE_WEB_CLIENT_ID` | Google OAuth *Web* client id; blank disables Google sign-in |
| `PORT` | Defaults to 3000 |

Generate a signing secret (never reuse the example value):

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Create the schema and start the server:

```bash
npx prisma migrate deploy   # applies prisma/migrations to the database
npx prisma generate
npm run dev                 # nodemon on http://localhost:3000
```

To change the schema, edit `prisma/schema.prisma` and run
`npx prisma migrate dev --name what_changed`, which writes a new migration and
applies it. (In a non-interactive shell that command refuses to run — generate
the SQL with `prisma migrate diff --from-schema-datasource prisma/schema.prisma
--to-schema-datamodel prisma/schema.prisma --script`, save it as a new folder
under `prisma/migrations/`, then `npx prisma migrate deploy`.)
`wealthtrack.sql` predates the migration history and is kept only as a
reference dump.

Money is stored as `Decimal(12, 2)` rather than a float, and totals — including
the yearly report — are summed by the database, so amounts are exact end to
end. The API converts them to JSON numbers on the way out.

### API

All routes except `/auth/register`, `/auth/login`, and `/auth/google` require
an `Authorization: Bearer <token>` header. Every query is scoped to the
authenticated user. Credential routes are rate-limited by failure count.

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/auth/register` | Create an account (seeds 8 default categories) |
| `POST` | `/auth/login` | Exchange credentials for a token |
| `POST` | `/auth/google` | Exchange a Google ID token for a token (verified server-side; links to an existing account by email, else creates one) |
| `GET` | `/auth/me` | Validate a stored token, return the profile |
| `GET` | `/expenses` | List expenses; `?month=&year=` scopes to one month |
| `POST` | `/expenses` | Create an expense |
| `PUT` | `/expenses/:id` | Update an expense |
| `DELETE` | `/expenses/:id` | Delete an expense |
| `GET` | `/budget` | Read the budget for `?month=&year=` |
| `POST` | `/budget` | Create or update a month's budget |
| `GET` | `/categories` | List categories |
| `POST` | `/categories` | Create a category |
| `PUT` | `/categories/:id` | Rename or recolour a category |
| `DELETE` | `/categories/:id` | Delete a category (409 if it still has expenses) |
| `GET` | `/reports/summary` | Year report for `?year=`: totals by month and category, summed in SQL |
| `GET` | `/health` | Liveness check, no auth |

## Mobile

```bash
cd mobile
npm install     # postinstall applies patches/ via patch-package
```

In development the app talks to the backend **over the LAN**: set `LAN_IP` in
`src/config/api.config.js` to this machine's address (`ipconfig`). Metro still
loads over USB, so after plugging the phone in:

```bash
adb reverse tcp:8081 tcp:8081   # or: npm run tunnel
npm start                       # Metro bundler
```

To build and install on the connected device, **do not use `npm run android`**
— React Native 0.72's CLI cannot spawn `gradlew.bat` under Node 22+. Use
Gradle directly:

```powershell
cd android
.\gradlew.bat app:installDebug
adb shell am start -n com.wealthtrack/.MainActivity
```

JavaScript changes hot-reload from Metro; anything under `android/` (including
fonts in `app/src/main/assets/fonts/`) needs the Gradle build again.

### Google sign-in

The Web client id lives in `src/config/google.config.js` and in the backend's
`GOOGLE_WEB_CLIENT_ID` (it is not a secret). The *Android* OAuth client is
matched by package name (`com.wealthtrack`) plus the signing certificate's
SHA-1 — register the fingerprint of **every** keystore you build with, or
sign-in fails with `DEVELOPER_ERROR`. Print the one that actually signed a
build with `keytool -printcert -jarfile app-debug.apk`.

### Build toolchain notes

- Pinned to AGP 7.4.2 / Gradle 7.6 / Kotlin 1.8 — newer AGP wants compileSdk
  35 and conflicts with RN 0.72's libraries.
- `react-native-linear-gradient` needs a `namespace` line its published
  build.gradle lacks; `patches/` carries the fix and patch-package applies it
  on every install. `android/patch_namespaces.ps1` is the legacy fallback and
  can be deleted once a clean `npm ci` + Gradle build has been verified.
- Custom fonts resolve by exact file name (`fontFamily: 'SpaceGrotesk-Bold'` →
  `assets/fonts/SpaceGrotesk-Bold.ttf`), one file per weight, and must not be
  combined with `fontWeight` (Android paints synthetic bold on top).

## Known gaps

- Release builds are signed with the **debug keystore** — generate a real one
  before distributing, and register its SHA-1 for Google sign-in.
- `PRODUCTION_API_URL` in `src/config/api.config.js` is a deliberately
  unresolvable placeholder; point it at a real HTTPS deployment before any
  release. Release builds refuse cleartext HTTP by design.
- The backend has no deployment target yet; helmet's HSTS is disabled because
  local development runs plain HTTP. Re-enable it behind HTTPS.
- No automated test coverage to speak of. `RELEASE_CHECKLIST.md` carries the
  manual smoke list until that changes.
