# TimeBank architecture

## System overview

```mermaid
flowchart TD
    U[Student browser<br/>React + Tailwind] -->|REST /api, JWT| API[Express API]
    subgraph Render web service
      API --> AUTH[Auth<br/>college email + OTP + JWT]
      API --> MATCH[Skills and matching<br/>keyword + AI score]
      API --> BOOK[Booking<br/>slots and conflict checks]
      API --> LEDGER[Ledger<br/>escrow, release, earn cap]
      API --> SETTLE[Settlement<br/>auto-release, refund, disputes]
      API --> FB[Feedback<br/>ratings]
      API -. serves .-> STATIC[Built React app<br/>client/dist]
    end
    MATCH -. optional .-> LLM[Embeddings API<br/>Gemini or OpenAI]
    AUTH -. optional .-> SMTP[SMTP<br/>OTP email]
    AUTH --> DB[(PostgreSQL<br/>Supabase, schema: timebank)]
    MATCH --> DB
    BOOK --> DB
    LEDGER --> DB
    SETTLE --> DB
    FB --> DB
    TIMER[10-minute timer] --> SETTLE
```

Without `DATABASE_URL` the same code runs on embedded PGlite. Without `LLM_API_KEY` search falls back to keyword matching. Without SMTP the OTP is printed in the server log.

## Credit flow (double-entry ledger)

```mermaid
sequenceDiagram
    participant L as Learner
    participant S as TimeBank
    participant M as Mentor
    S->>L: GRANT welcome credits (mint to available)
    L->>S: Book session
    S->>S: HOLD (learner available to learner held)
    Note over S: Credits are in escrow
    L->>S: Confirm
    M->>S: Confirm
    S->>M: RELEASE (learner held to mentor available)
```

Every transaction sums to zero, and every ledger row stores the hash of the previous row. `GET /api/ledger/verify` recomputes the chain.

## Session lifecycle

```mermaid
stateDiagram-v2
    [*] --> booked: book (credits held)
    booked --> cancelled: cancel (refund)
    booked --> completed: both confirm (release)
    booked --> completed: one confirmed, other silent 48h (auto-release)
    booked --> cancelled: nobody confirmed 72h (auto-refund)
    booked --> disputed: learner disputes (before confirming)
    disputed --> cancelled: mentor agrees or 7 days pass (refund)
    disputed --> completed: learner withdraws (release)
```

## Match score

```mermaid
flowchart LR
    F[Skill fit 40%] --> S[Match score 0-100]
    A[Availability overlap 25%] --> S
    R[Mentor rating 20%] --> S
    C[Reciprocity 15%] --> S
```

## Data model

```mermaid
erDiagram
    users ||--o{ skills : lists
    users ||--o{ availability : sets
    users ||--o{ sessions : "mentors or learns"
    skills ||--o{ sessions : booked_for
    sessions ||--o| reviews : receives
    sessions ||--o{ ledger : moves_credits
    users ||--o{ ledger : owns
```
