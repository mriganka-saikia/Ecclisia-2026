# TimeBank: Campus Skill Exchange Using Time Credits

**ECCLISIA 4.0 · Problem Statement ECCLISIA26-003 · Team Ionize**

> Status: planning phase. All development happens during the hackathon window, and every feature below starts unchecked. See [Progress](#progress).

## Problem

Students have skills (coding, design, languages, music, academics) but paid tutoring is unaffordable, and informal peer help is hard to find, trust and schedule.

## Solution

TimeBank is a campus-only platform where students teach and learn skills using **time credits instead of money**.

- 1 hour taught = 1 credit earned
- 1 hour learned = 1 credit spent
- Every credit movement is recorded in a transparent ledger

## Core Features (MVP)

1. **Student registration and verification:** signup restricted to the college email domain
2. **Skill listing, search and matching:** offer and request skills, ranked by a weighted match score
3. **Session booking and scheduling:** pick a slot, with double-booking prevention
4. **Time-credit system:** credits are held in escrow at booking and released when both sides confirm; daily earn cap limits abuse
5. **Confirmation, history and feedback:** wallet and transaction history, ratings after each session
6. **AI-assisted search:** describe what you want to learn in plain language (for example "guitar basics tonight") and get ranked mentors via embeddings, with a keyword-search fallback

### Match score (design parameters)

| Factor | Weight |
|---|---|
| Skill fit | 40% |
| Availability overlap | 25% |
| Mentor rating | 20% |
| Reciprocity | 15% |

## Architecture

```
React web app
     |
Express API (REST, JWT auth)
     |-- Auth module        (college-email check + JWT)
     |-- Skills + Matching  (keyword search, weighted score, AI semantic search)
     |-- Booking module     (slots, conflict checks)
     |-- Ledger module      (escrow, release, earn cap)
     |-- Feedback module    (ratings)
     |
PostgreSQL (Supabase)
```

### Data model

`users`, `skills`, `availability`, `sessions`, `ledger`, `reviews`. Schema is in `/db/schema.sql`.

## Tech Stack

| Layer | Choice |
|---|---|
| Frontend | React, Tailwind CSS |
| Backend | Node.js, Express |
| Database | PostgreSQL (Supabase) |
| Auth | JWT, bcrypt, college-email-domain check |
| AI | LLM API (embeddings) for semantic skill search, no custom model training |
| Hosting | Render / Vercel |

## Getting Started

```bash
# 1. Clone
git clone https://github.com/[your-username]/timebank-campus.git
cd timebank-campus

# 2. Backend
cd server
cp .env.example .env     # add DATABASE_URL, JWT_SECRET, LLM_API_KEY
npm install
npm run dev

# 3. Frontend (new terminal)
cd client
npm install
npm run dev
```

Seed demo data: `npm run seed` (inside `/server`).

## Project Structure

```
timebank-campus/
├── client/          # React app
├── server/          # Express API and modules
├── db/schema.sql    # Database schema
├── docs/            # Architecture diagram, slides
└── README.md
```

## Progress

- [ ] Repo, schema and scaffold
- [ ] Signup and login
- [ ] Skill listing and search
- [ ] Slot booking
- [ ] Credit escrow and release
- [ ] Daily earn cap
- [ ] Match score
- [ ] AI semantic search (with keyword fallback)
- [ ] Wallet and history
- [ ] Feedback and ratings
- [ ] Deployment

## Development Timeline

| Checkpoint | Target |
|---|---|
| 12:00 PM | Signup, skills and booking working |
| 4:00 PM | Full flow working end to end |
| 6:00 PM | Final commit and submission |

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
