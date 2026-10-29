ALTER TABLE plans ADD COLUMN roster_revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE registrations ADD COLUMN capacities TEXT;
CREATE TABLE planning_boards (
  plan_id TEXT PRIMARY KEY REFERENCES plans(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL DEFAULT 1,
  hq TEXT NOT NULL DEFAULT '{"capacity":0,"infantryPercent":75,"cavalryPercent":25,"participants":[]}',
  published TEXT,
  publication_revision INTEGER NOT NULL DEFAULT 0,
  published_at TEXT
) STRICT;
INSERT INTO planning_boards (plan_id) SELECT id FROM plans;
CREATE TABLE assignment_drafts (
  plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  registration_id TEXT NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
  marches TEXT NOT NULL,
  PRIMARY KEY (plan_id, registration_id)
) STRICT;
CREATE TRIGGER roster_added AFTER INSERT ON registrations BEGIN
  UPDATE plans SET roster_revision = roster_revision + 1 WHERE id = NEW.plan_id;
END;
CREATE TRIGGER roster_edited AFTER UPDATE ON registrations BEGIN
  UPDATE plans SET roster_revision = roster_revision + 1 WHERE id = NEW.plan_id;
END;
CREATE TRIGGER roster_removed AFTER DELETE ON registrations BEGIN
  UPDATE plans SET roster_revision = roster_revision + 1 WHERE id = OLD.plan_id;
  UPDATE planning_boards SET revision = revision + 1 WHERE plan_id = OLD.plan_id;
END;
CREATE TRIGGER draft_added AFTER INSERT ON assignment_drafts BEGIN
  UPDATE planning_boards SET revision = revision + 1 WHERE plan_id = NEW.plan_id;
END;
CREATE TRIGGER draft_edited AFTER UPDATE ON assignment_drafts BEGIN
  UPDATE planning_boards SET revision = revision + 1 WHERE plan_id = NEW.plan_id;
END;
