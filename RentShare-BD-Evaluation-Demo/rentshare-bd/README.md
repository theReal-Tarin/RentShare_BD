# RentShare BD

A working evaluation demo for finding a place and a compatible roommate in Bangladesh. Built with React + Vite, Express, and SQLite. The compatibility engine uses **explicit, weighted rules — it is not AI or machine learning**.

## Run locally

You need **Node.js 24 or newer** and npm. The database uses Node's built-in SQLite support; you do not need to install MySQL or a separate database server.

From this folder:

```sh
npm install
npm run dev
```

Open **http://127.0.0.1:5173**. The API runs on port 3001 and the Vite development server forwards API requests to it. A fresh database is populated automatically with synthetic demo accounts, properties, and roommate profiles.

For a single-server production-style demo:

```sh
npm run build
npm start
```

Open **http://127.0.0.1:3001**. Stop the development servers first so port 3001 is free.

## Demo sign-in

| Role | Email | Password |
| --- | --- | --- |
| Tenant | `tenant@rentshare.demo` | `RentShare123!` |
| Landlord | `landlord@rentshare.demo` | `RentShare123!` |

The sign-in dialog also has **Tenant demo** and **Landlord demo** buttons. The tenant account is Ayesha Rahman; the landlord account is Farhan Ahmed. The seed includes six listings across Ashulia, Dhanmondi, Mirpur, and Uttara, plus four potential roommates.

All seeded people, contact details, properties, prices, availability, and matching results are demonstration data. They do not represent verified rentals or real users.

New visitors can also register as a tenant or landlord. A new tenant should complete the roommate preference profile before using matches.

## The four implemented features

1. **Account and profile:** tenant/landlord registration, login, logout, and editable personal profiles.
2. **Property listings:** landlords create listings; tenants browse, open details, and search/filter by location and budget.
3. **Roommate preferences:** budget, preferred location, smoking, cleanliness, sleep schedule, noise tolerance, and work/study schedule.
4. **Explainable compatibility:** a weighted, rule-based percentage with factor-by-factor contributions and clear reasons for alignment and differences.

There are no payments, chat, bookings, machine-learning predictions, identity verification, or production trust scores in this demo.

## Data and seeding

The local SQLite database at `data/rentshare.sqlite` retains registered users, profile changes, preferences, and new listings between server restarts. Database files are ignored by version control. Set `DB_PATH` to use another database location; `SEED_DEMO=false` disables automatic seeding.

```sh
npm run seed
```

Seeding is non-destructive: it ensures demo records exist without clearing your work. The app also seeds a fresh database on its first start. Keep the supplied demo credentials for the supervisor walkthrough.

## Tests

```sh
npm test
```

The tests use isolated databases and do not modify your demo data. See [testing notes](docs/TESTING.md) for the test coverage and the last recorded verification result.

## How compatibility is calculated

| Factor | Weight | Rule |
| --- | ---: | --- |
| Budget | 25% | Overlapping amount divided by the smaller budget-range width. A fixed budget matches when it falls within the other range. |
| Location | 20% | Same location, ignoring surrounding spaces and letter case: full points; different location: zero. |
| Smoking | 20% | Same preference: full points; different preference: zero. |
| Cleanliness | 15% | Same level: full points; adjacent levels: half; opposite levels: zero. |
| Sleep schedule | 10% | Same level: full points; adjacent levels: half; opposite levels: zero. |
| Noise | 5% | Same level: full points; adjacent levels: half; opposite levels: zero. |
| Work / study schedule | 5% | Same schedule: full points; one flexible schedule: half; day versus night: zero. |

The total is the sum of the factor contributions, rounded to a whole percentage. An explanation accompanies every factor. The fixed weights total 100%; user-adjustable weights are outside this demo's scope. Scores measure preference alignment under these rules, not personality, safety, or the probability of a successful household.

## Project guide

- `src/` — React user interface.
- `server/` — Express API, SQLite storage, session authentication, seed data, and matching rules.
- `tests/` — automated API and matching checks.
- [Supervisor demo script](docs/SUPERVISOR_DEMO.md) — a 3–5 minute walkthrough.
- [Scoped product brief](docs/PRODUCT_BRIEF.md) — the presentation alignment, scope, and design decisions.
- [Testing notes](docs/TESTING.md) — verification status and a manual rehearsal checklist.

## Demo architecture and boundaries

A single Express server owns the SQLite database, sessions, and matching calculations. The React app talks to that API. SQLite keeps the evaluation setup frictionless while still demonstrating real persistence and access control. A MySQL/Prisma migration is a future change; it is not implemented here.

This build is intended for a local academic evaluation. Public deployment would require a separate hardening pass, including HTTPS, rate limiting, account recovery, monitoring, database backups, and image-upload infrastructure. Listing photos are original generated illustrations bundled locally for this demo; the interface labels them as illustrative. This version lets landlords choose a demo photo rather than upload media. After the dependencies are installed and the app is built, it works without internet access.

## Troubleshooting

- **Node or SQLite import error:** check `node --version`; use Node 24 or newer.
- **Port already in use:** stop the earlier running app before restarting. Development uses ports 5173 and 3001.
- **The single-server page is unavailable:** run `npm run build` before `npm start`.
- **No matches for a new account:** save a complete roommate preference profile first.
- **The seeded accounts are missing:** run `npm run seed`, then restart the app.
