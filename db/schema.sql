-- TimeBank schema (PostgreSQL / Supabase; also runs on embedded PGlite for zero-setup demos)
-- Credits are stored as integer MINUTES (60 min = 1 credit) so there is never float drift.

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  department    TEXT NOT NULL DEFAULT '',
  year          TEXT NOT NULL DEFAULT '',
  bio           TEXT NOT NULL DEFAULT '',
  verified      BOOLEAN NOT NULL DEFAULT false,
  otp_hash      TEXT,
  otp_expires   TIMESTAMPTZ,
  otp_attempts  INT NOT NULL DEFAULT 0,
  rating_avg    DOUBLE PRECISION NOT NULL DEFAULT 0,
  rating_count  INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- kind = 'offer' (I can teach this) or 'want' (I want to learn this)
CREATE TABLE IF NOT EXISTS skills (
  id          SERIAL PRIMARY KEY,
  user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('offer','want')),
  title       TEXT NOT NULL,
  category    TEXT NOT NULL,
  level       TEXT NOT NULL DEFAULT 'all' CHECK (level IN ('all','beginner','intermediate','advanced')),
  description TEXT NOT NULL DEFAULT '',
  embedding   JSONB,
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS skills_user_idx ON skills(user_id);
CREATE INDEX IF NOT EXISTS skills_kind_idx ON skills(kind, active);

-- Recurring weekly windows, in campus-local minutes since midnight. weekday: 0 = Sunday.
CREATE TABLE IF NOT EXISTS availability (
  id        SERIAL PRIMARY KEY,
  user_id   INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  weekday   INT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_min INT NOT NULL CHECK (start_min >= 0),
  end_min   INT NOT NULL CHECK (end_min <= 1440 AND end_min > start_min)
);
CREATE INDEX IF NOT EXISTS availability_user_idx ON availability(user_id);

CREATE TABLE IF NOT EXISTS sessions (
  id                   SERIAL PRIMARY KEY,
  skill_id             INT NOT NULL REFERENCES skills(id),
  mentor_id            INT NOT NULL REFERENCES users(id),
  learner_id           INT NOT NULL REFERENCES users(id),
  start_at             TIMESTAMPTZ NOT NULL,
  end_at               TIMESTAMPTZ NOT NULL,
  minutes              INT NOT NULL CHECK (minutes IN (30,60,90,120)),
  status               TEXT NOT NULL DEFAULT 'booked' CHECK (status IN ('booked','completed','cancelled','disputed')),
  mentor_confirmed_at  TIMESTAMPTZ,
  learner_confirmed_at TIMESTAMPTZ,
  completed_at         TIMESTAMPTZ,
  cancelled_by         INT REFERENCES users(id),
  disputed_by          INT REFERENCES users(id),
  disputed_at          TIMESTAMPTZ,
  resolution           TEXT,   -- auto_release | auto_refund | dispute_refund | dispute_withdrawn | dispute_timeout
  meet_url             TEXT,
  note                 TEXT NOT NULL DEFAULT '',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (mentor_id <> learner_id)
);
CREATE INDEX IF NOT EXISTS sessions_mentor_idx  ON sessions(mentor_id, start_at);
CREATE INDEX IF NOT EXISTS sessions_learner_idx ON sessions(learner_id, start_at);

-- Double-entry, hash-chained ledger. Every txn sums to zero; every row commits to the previous row's hash.
--   GRANT   mint -m              | user.available +m
--   HOLD    learner.available -m | learner.held +m          (escrow)
--   RELEASE learner.held -m      | mentor.available +m
--   REFUND  learner.held -m      | learner.available +m
CREATE TABLE IF NOT EXISTS ledger (
  seq        INT PRIMARY KEY,
  txn_id     TEXT NOT NULL,
  user_id    INT REFERENCES users(id),
  bucket     TEXT NOT NULL CHECK (bucket IN ('available','held','mint')),
  delta      INT NOT NULL,
  type       TEXT NOT NULL CHECK (type IN ('GRANT','HOLD','RELEASE','REFUND')),
  session_id INT REFERENCES sessions(id),
  memo       TEXT NOT NULL DEFAULT '',
  prev_hash  TEXT NOT NULL,
  hash       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS ledger_user_idx ON ledger(user_id, seq);
CREATE INDEX IF NOT EXISTS ledger_txn_idx  ON ledger(txn_id);

CREATE TABLE IF NOT EXISTS ledger_head (
  id   INT PRIMARY KEY CHECK (id = 1),
  seq  INT NOT NULL,
  hash TEXT NOT NULL
);
INSERT INTO ledger_head (id, seq, hash) VALUES (1, 0, 'GENESIS') ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS reviews (
  id          SERIAL PRIMARY KEY,
  session_id  INT NOT NULL UNIQUE REFERENCES sessions(id),
  reviewer_id INT NOT NULL REFERENCES users(id),
  mentor_id   INT NOT NULL REFERENCES users(id),
  rating      INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment     TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reviews_mentor_idx ON reviews(mentor_id);

-- Upgrade path for databases created before disputes existed. Safe to run on every start.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS disputed_by INT REFERENCES users(id);
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS disputed_at TIMESTAMPTZ;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS resolution  TEXT;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'sessions'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%disputed%') THEN
    ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_status_check;
    ALTER TABLE sessions ADD CONSTRAINT sessions_status_check CHECK (status IN ('booked','completed','cancelled','disputed'));
  END IF;
END $$;
