-- Messages the leaders copy into game chat, optionally about one task. The words are theirs; the
-- page fills any {gaps} (the task, its next date and who has it) when it copies.
CREATE TABLE hub_templates (
  id TEXT PRIMARY KEY,
  hub_id TEXT NOT NULL REFERENCES hubs(id) ON DELETE CASCADE,
  task_id TEXT REFERENCES hub_tasks(id) ON DELETE SET NULL,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 60),
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 1000),
  position INTEGER NOT NULL,
  edited_by TEXT NOT NULL,
  edited_at TEXT NOT NULL,
  created_at TEXT NOT NULL
) STRICT;
CREATE INDEX hub_templates_hub ON hub_templates(hub_id, position);

CREATE TRIGGER hub_template_limit BEFORE INSERT ON hub_templates
WHEN (SELECT count(*) FROM hub_templates WHERE hub_id = NEW.hub_id) >= 40
BEGIN
  SELECT RAISE(ABORT, 'hub_template_limit');
END;
