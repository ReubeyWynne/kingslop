-- A hub's written pages: the alliance rules, its notes and its event times. Each is one short
-- text with the name of whoever saved it last and a revision, so a stale save is refused.
CREATE TABLE hub_sections (
  hub_id TEXT NOT NULL REFERENCES hubs(id) ON DELETE CASCADE,
  section TEXT NOT NULL CHECK (section IN ('rules', 'notes', 'times')),
  body TEXT NOT NULL CHECK (length(body) <= 4000),
  revision INTEGER NOT NULL DEFAULT 1,
  edited_by TEXT NOT NULL,
  edited_at TEXT NOT NULL,
  PRIMARY KEY (hub_id, section)
) STRICT;
