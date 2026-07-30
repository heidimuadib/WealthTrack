# WealthTrack

A personal expense tracker for Philippine peso (₱) spending — log expenses
against categories, set a monthly budget, and see where the money went.

```
WealthTrack/
├── backend/   Express + Prisma API backed by Postgres
└── mobile/    React Native app (Android / iOS)
```

## Requirements

- Node.js 18+
- PostgreSQL 14+
- Android Studio + SDK (for the Android build), or Xcode (for iOS)

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
| `PORT` | Defaults to 3000 |

Generate a signing secret (never reuse the example value):

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Create the schema and start the server:

```bash
npx prisma db push      # applies prisma/schema.prisma to the database
npx prisma generate
npm run dev             # nodemon on http://localhost:3000
```

> There is no `prisma/migrations/` directory — the schema is applied directly
> with `db push`. `wealthtrack.sql` holds the equivalent raw DDL for reference.

### API

All routes except `/auth/register` and `/auth/login` require an
`Authorization: Bearer <token>` header. Every query is scoped to the
authenticated user.

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/auth/register` | Create an account (seeds 8 default categories) |
| `POST` | `/auth/login` | Exchange credentials for a token |
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

## Mobile

```bash
cd mobile
npm install
```

The app talks to the API at `localhost:3000` on the device, which `adb reverse`
maps back to this machine. That mapping does not survive unplugging the cable
or the phone sleeping, so re-run it whenever API calls start failing:

```bash
npm run tunnel          # adb reverse for ports 3000 and 8081
npm start               # Metro bundler
npm run android         # build and install
```

To reach the backend over Wi-Fi instead of USB, set `LAN_IP` in
`src/config/api.config.js` to this machine's address (`ipconfig`).

## Known gaps

- `src/config/api.config.js` still points production at a placeholder URL.
- Release builds are signed with the debug keystore — generate a real one
  before distributing.
- `Expense.amount` and `Budget.amount` are `Float`; money should move to
  `Decimal` before this handles real balances.
