-- Alliance hubs: one hub per alliance. The R5 owns it, R4s join through one shared invite
-- link and wait for approval, and members read through one member link.
CREATE TABLE hubs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  owner_name TEXT NOT NULL CHECK (length(owner_name) BETWEEN 1 AND 40),
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
) STRICT;
CREATE INDEX hubs_expiry ON hubs(expires_at);

CREATE TABLE hub_leaders (
  id TEXT PRIMARY KEY,
  hub_id TEXT NOT NULL REFERENCES hubs(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 40),
  status TEXT NOT NULL CHECK (status IN ('waiting', 'approved')),
  created_at TEXT NOT NULL,
  approved_at TEXT,
  last_seen_at TEXT NOT NULL
) STRICT;
CREATE INDEX hub_leaders_hub ON hub_leaders(hub_id, created_at, id);

CREATE TABLE hub_tokens (
  token_hash TEXT PRIMARY KEY,
  hub_id TEXT NOT NULL REFERENCES hubs(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'invite', 'member', 'leader')),
  leader_id TEXT REFERENCES hub_leaders(id) ON DELETE CASCADE,
  CHECK ((role = 'leader' AND leader_id IS NOT NULL) OR (role != 'leader' AND leader_id IS NULL))
) STRICT;
CREATE INDEX hub_tokens_hub ON hub_tokens(hub_id);

-- The invite link can leak, so the number of R4s and of people waiting is capped.
CREATE TRIGGER hub_leader_limit BEFORE INSERT ON hub_leaders
WHEN (SELECT count(*) FROM hub_leaders WHERE hub_id = NEW.hub_id) >= 60
BEGIN
  SELECT RAISE(ABORT, 'hub_leader_limit');
END;

CREATE TRIGGER hub_waiting_limit BEFORE INSERT ON hub_leaders
WHEN (SELECT count(*) FROM hub_leaders WHERE hub_id = NEW.hub_id AND status = 'waiting') >= 20
BEGIN
  SELECT RAISE(ABORT, 'hub_waiting_limit');
END;
