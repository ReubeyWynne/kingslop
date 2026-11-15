-- When a task falls due, and who takes each date. A task's cadence is JSON (js/hub-engine.mjs); its
-- dates are worked out on every read, and a row here exists only where a date differs from the
-- default: someone took it, or it is done. The duty rule says what an untaken date means:
-- 'usual' falls to the task's holders, 'claim' waits for somebody to take it.
ALTER TABLE hub_tasks ADD COLUMN cadence TEXT CHECK (cadence IS NULL OR length(cadence) <= 200);
ALTER TABLE hub_tasks ADD COLUMN duty_rule TEXT NOT NULL DEFAULT 'usual' CHECK (duty_rule IN ('usual', 'claim'));

CREATE TABLE hub_duties (
  task_id TEXT NOT NULL REFERENCES hub_tasks(id) ON DELETE CASCADE,
  date TEXT NOT NULL CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  taker TEXT,
  done INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0, 1)),
  PRIMARY KEY (task_id, date)
) STRICT;

-- An R4 who leaves no longer holds the dates they took.
CREATE TRIGGER hub_leader_duties AFTER DELETE ON hub_leaders
BEGIN
  UPDATE hub_duties SET taker = NULL WHERE taker = OLD.id;
END;

-- Hubs made before cadences existed get the starter ones.
UPDATE hub_tasks SET cadence = '{"type":"weekly","weekday":1}' WHERE name = 'Alliance Championship Signups' AND cadence IS NULL;
UPDATE hub_tasks SET cadence = '{"type":"wheel","days":[7,21]}' WHERE name = 'Swordland Signups' AND cadence IS NULL;
UPDATE hub_tasks SET cadence = '{"type":"wheel","days":[20]}' WHERE name = 'Tri-Alliance Signups' AND cadence IS NULL;
UPDATE hub_tasks SET cadence = '{"type":"vikings","day":"thu"}' WHERE name = 'Vikings HQ Management' AND cadence IS NULL;
UPDATE hub_tasks SET cadence = '{"type":"weekly","weekday":5}' WHERE name = 'Sanctuary Reward Distribution' AND cadence IS NULL;
