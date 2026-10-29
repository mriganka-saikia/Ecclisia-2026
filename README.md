# TimeBank: Campus Skill Exchange Using Time Credits

**ECCLISIA 4.0 · Problem Statement ECCLISIA26-003 · Team Ionize**

**Live demo:** https://ecclisia-2026.onrender.com
(Hosted on Render's free tier. If it has been idle, the first load can take about a minute to wake up.)

> Status: MVP complete and deployed. Every core feature below is built and covered by automated tests. See [Progress](#progress).

## Problem

Students have skills (coding, design, languages, music, academics) but paid tutoring is unaffordable, and informal peer help is hard to find, trust and schedule.

## Solution

TimeBank is a campus-only platform where students teach and learn skills using **time credits instead of money**.

- 1 hour taught = 1 credit earned
- 1 hour learned = 1 credit spent
- Every credit movement is recorded in a transparent, tamper-evident ledger

## Features

1. **Student registration and verification:** signup restricted to the college email domain, confirmed with a one-time code. New students get 3 welcome credits.
2. **Skill listing, search and matching:** offer skills you can teach and request skills you want to learn. Mentors are ranked by a weighted match score that is shown to the user.
3. **AI-assisted search:** describe what you want in plain language (for example "guitar basics tonight"). Time phrases are parsed, and mentors are ranked using embeddings, with typo-tolerant keyword search as an automatic fallback when no AI key is set.
4. **Session booking and scheduling:** pick a free slot from the mentor's weekly availability, with double-booking prevention for both mentor and learner.
5. **Time-credit escrow:** credits are held in escrow at booking and released to the mentor only when both sides confirm. A daily earn cap limits abuse.
6. **Settlement and disputes:** sessions that nobody finishes are settled automatically, and a learner can open a dispute (see [Settlement rules](#settlement-rules)).
7. **Demand-gap view:** shows skills that students are asking for but nobody teaches yet, with a one-click "Teach this" button that prefills the offer form. A gap closes as soon as someone offers to teach it.
8. **Calendar export:** every booked session can be added to Apple, Outlook or Google Calendar (.ics download or Google Calendar link).
9. **Wallet, history and feedback:** available and held balances, full transaction history, and 1 to 5 star reviews after each session.
10. **Public ledger audit:** a ledger feed and a verification endpoint that re-checks the hash chain, plus a leaderboard.

### Match score

The score is the weighted sum of four factors, and the UI shows each factor's contribution.

| Factor | Weight | What it measures |
|---|---|---|
| Skill fit | 40% | Semantic similarity (when AI is on) blended with keyword match and level |
| Availability overlap | 25% | Mentor's free time vs. the time you asked for or your own schedule |
| Mentor rating | 20% | Average rating, smoothed so one review does not dominate |
| Reciprocity | 15% | The mentor wants to learn something you can teach |

### Credit rules

| Rule | Value |
|---|---|
| Welcome credits | 3 hours |
| Daily earn cap | 4 hours per mentor per day |
| Session lengths | 30, 60, 90 or 120 minutes |
| Storage | Integer minutes (60 min = 1 credit), so there is no floating-point drift |

### Settlement rules

Windows are counted from the **end** of the session and are configurable through environment variables.

| Situation | Outcome | Default |
|---|---|---|
| Both sides confirm | Escrow released to the mentor | immediate |
| One side confirmed, the other silent | **Auto-release** to the mentor | after 48 h (`AUTO_RELEASE_HOURS`) |
| Nobody confirmed | **Auto-refund** to the learner | after 72 h (`AUTO_REFUND_HOURS`) |
| Learner opens a dispute (only before they confirm) | Credits stay in escrow until resolved | n/a |
| Mentor agrees to refund | Learner is refunded | immediate |
| Learner withdraws the dispute | Credits released to the mentor | immediate |
| Dispute unresolved | Refund to the learner | after 7 days (`DISPUTE_RESOLVE_DAYS`) |

Settlement runs on a timer every 10 minutes and lazily whenever sessions or the wallet are read. Each session is re-checked under a row lock, so overlapping runs can never settle the same session twice.

## Architecture

```
React web app (Vite, Tailwind)
     |
Express API (REST, JWT auth), also serves the built React app
     |-- Auth module        (college-email check, OTP, JWT)
     |-- Skills + Matching  (keyword search, weighted score, AI semantic search)
     |-- Booking module     (slots, conflict checks)
     |-- Ledger module      (double-entry, escrow, release, earn cap)
     |-- Settlement module  (auto-release, auto-refund, disputes)
     |-- Feedback module    (ratings)
     |
PostgreSQL (Supabase), or embedded PGlite when no DATABASE_URL is set
```

More detail and diagrams are in [docs/architecture.md](architecture.md).

### Data model

`users`, `skills`, `availability`, `sessions`, `ledger`, `ledger_head`, `reviews`. The schema is in [`db/schema.sql`](db/schema.sql) and is safe to run on every start.

The ledger is **double-entry and hash-chained**: every transaction sums to zero, and every row stores the hash of the previous row. `GET /api/ledger/verify` recomputes the chain and reports any tampering.

## Tech Stack

| Layer | Choice |
|---|---|
| Frontend | React, React Router, Tailwind CSS, Vite |
| Backend | Node.js 20+, Express 5 |
| Database | PostgreSQL (Supabase); embedded PGlite for zero-setup local runs |
| Auth | JWT, bcrypt, college-email-domain check, email OTP (Nodemailer) |
| AI | Embeddings API (Gemini or OpenAI) for semantic skill search, no custom model training |
| Testing / CI | Node smoke tests on embedded Postgres, client unit tests, GitHub Actions |
| Hosting | Render (single web service) with Supabase |

## Getting Started

```bash
# 1. Clone
git clone https://github.com/mriganka-saikia/Ecclisia-2026.git
cd Ecclisia-2026

# 2. Backend
cd server
cp .env.example .env     # add JWT_SECRET; DATABASE_URL and LLM_API_KEY are optional
npm install
npm run dev

# 3. Frontend (new terminal)
cd client
npm install
npm run dev
```

With no `DATABASE_URL`, the server runs on embedded Postgres and fills an empty database with demo students, skills and ledger history. All seeded students use the password `demo1234`.

Run the tests from the repository root: `npm test`.

## Deployment (Render, without Blueprint)

The Express server serves the built React app, so one Render Web Service is enough.

| Setting | Value |
|---|---|
| Build command | `npm run build` |
| Start command | `npm start` |
| Health check path | `/api/health` |

Environment variables:

| Key | Notes |
|---|---|
| `NODE_VERSION` | `22` |
| `NPM_CONFIG_INCLUDE` | `dev` (the client build needs Vite, which is a dev dependency) |
| `NODE_ENV` | `production` |
| `JWT_SECRET` | required, long random string |
| `COLLEGE_EMAIL_DOMAIN` | allowed signup domain(s), comma-separated |
| `DATABASE_URL` | Supabase **Session pooler** string (Render's free tier cannot reach Supabase's IPv6-only direct host) |
| `CLIENT_ORIGIN` | the public URL of the service |
| `DEMO_MODE`, `AUTO_SEED` | `true` for demos, `false` for real use |
| `LLM_API_KEY` | optional, enables AI semantic search |
| `SMTP_*` | optional, emails the OTP; without it the code is printed in the server log |

All options are documented in [`server/.env.example`](server/.env.example).

## Project Structure

```
Ecclisia-2026/
├── client/          # React app (pages: Landing, Auth, Discover, Teach, Sessions, Wallet, Demand)
├── server/          # Express API: routes, services (match, sessions, settle, slots), lib (ledger, embeddings)
├── db/schema.sql    # Database schema
├── docs/            # Architecture diagrams
├── .github/         # CI workflow
└── README.md
```

## Progress

- [x] Repo, schema and scaffold
- [x] Signup and login
- [x] Skill listing and search
- [x] Slot booking
- [x] Credit escrow and release
- [x] Daily earn cap
- [x] Match score
- [x] AI semantic search (with keyword fallback)
- [x] Wallet and history
- [x] Feedback and ratings
- [x] Settlement: auto-release, auto-refund and disputes
- [x] Demand-gap view
- [x] Calendar export (.ics and Google Calendar)
- [x] Hash-chained ledger with verification
- [x] Deployment

## Future Scope

AI-generated session agendas, skill-tag normalization, credit decay on idle balances, mentor badges, no-show penalties, in-app chat, reminders and notifications, multi-campus support, caching layer.

## Team Ionize

| Member | Role |
|---|---|
| Mriganka Saikia | Team Leader and Full-Stack Developer |
| Shivam Dutta | Developer and Research Lead |

## Hackathon Compliance

All application code in this repository is written during the ECCLISIA 4.0 development window. Open-source libraries and frameworks are used under their respective licences. Commit history is unedited.

## License

MIT
