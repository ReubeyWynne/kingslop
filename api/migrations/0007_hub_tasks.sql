-- Tasks an alliance's leaders carry, and who holds them. A task has any number of holders; a
-- holder is an R4's id, or 'owner' for the R5, and a claim may carry a short label ("Trap 2").
CREATE TABLE hub_tasks (
  id TEXT PRIMARY KEY,
  hub_id TEXT NOT NULL REFERENCES hubs(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
  note TEXT NOT NULL DEFAULT '' CHECK (length(note) <= 300),
  is_public INTEGER NOT NULL DEFAULT 0 CHECK (is_public IN (0, 1)),
  position INTEGER NOT NULL,
  created_at TEXT NOT NULL
) STRICT;
CREATE INDEX hub_tasks_hub ON hub_tasks(hub_id, position);

CREATE TABLE hub_claims (
  task_id TEXT NOT NULL REFERENCES hub_tasks(id) ON DELETE CASCADE,
  holder TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '' CHECK (length(label) <= 40),
  created_at TEXT NOT NULL,
  PRIMARY KEY (task_id, holder)
) STRICT;
CREATE INDEX hub_claims_holder ON hub_claims(holder);

-- An R4 who is removed or leaves takes their claims with them.
CREATE TRIGGER hub_leader_claims AFTER DELETE ON hub_leaders
BEGIN
  DELETE FROM hub_claims WHERE holder = OLD.id;
END;

CREATE TRIGGER hub_task_limit BEFORE INSERT ON hub_tasks
WHEN (SELECT count(*) FROM hub_tasks WHERE hub_id = NEW.hub_id) >= 40
BEGIN
  SELECT RAISE(ABORT, 'hub_task_limit');
END;
