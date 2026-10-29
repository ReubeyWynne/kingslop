CREATE TABLE plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  event_at TEXT,
  difficulty INTEGER CHECK (difficulty BETWEEN 1 AND 100),
  notes TEXT NOT NULL DEFAULT '' CHECK (length(notes) <= 2000),
  closed INTEGER NOT NULL DEFAULT 0 CHECK (closed IN (0, 1)),
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
) STRICT;
CREATE INDEX plans_expiry ON plans(expires_at);

CREATE TABLE registrations (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  nickname TEXT NOT NULL CHECK (length(nickname) BETWEEN 1 AND 40),
  availability TEXT NOT NULL CHECK (availability IN ('online', 'offline', 'unknown')),
  infantry INTEGER NOT NULL CHECK (infantry BETWEEN 0 AND 100000000),
  cavalry INTEGER NOT NULL CHECK (cavalry BETWEEN 0 AND 100000000),
  archers INTEGER NOT NULL CHECK (archers BETWEEN 0 AND 100000000),
  march_capacity INTEGER NOT NULL CHECK (march_capacity BETWEEN 0 AND 10000000),
  marches INTEGER NOT NULL CHECK (marches BETWEEN 1 AND 6),
  notes TEXT NOT NULL CHECK (length(notes) <= 300),
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
CREATE INDEX registrations_plan ON registrations(plan_id, created_at, id);

CREATE TABLE access_tokens (
  token_hash TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('manage', 'join', 'view', 'registration')),
  registration_id TEXT REFERENCES registrations(id) ON DELETE CASCADE,
  CHECK ((role = 'registration' AND registration_id IS NOT NULL) OR (role != 'registration' AND registration_id IS NULL))
) STRICT;
CREATE INDEX access_tokens_plan ON access_tokens(plan_id);

CREATE TRIGGER registration_limit BEFORE INSERT ON registrations
WHEN (SELECT count(*) FROM registrations WHERE plan_id = NEW.plan_id) >= 120
BEGIN
  SELECT RAISE(ABORT, 'registration_limit');
END;

CREATE TRIGGER registration_open BEFORE INSERT ON registrations
WHEN (SELECT closed FROM plans WHERE id = NEW.plan_id) = 1
BEGIN
  SELECT RAISE(ABORT, 'registration_closed');
END;

CREATE TRIGGER registration_unexpired BEFORE INSERT ON registrations
WHEN (SELECT expires_at FROM plans WHERE id = NEW.plan_id) <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
BEGIN
  SELECT RAISE(ABORT, 'registration_expired');
END;
