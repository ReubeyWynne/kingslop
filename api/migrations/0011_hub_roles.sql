-- Clearer wording for the starter tasks (only tasks still on the old names change), and roles: named bundles of tasks.
UPDATE hub_tasks SET name = 'Run Alliance Championship signups' WHERE name = 'Alliance Championship Signups';
UPDATE hub_tasks SET name = 'Run Swordland signups' WHERE name = 'Swordland Signups';
UPDATE hub_tasks SET name = 'Run Tri-Alliance signups' WHERE name = 'Tri-Alliance Signups';
UPDATE hub_tasks SET name = 'Pick the Vikings HQ lineup' WHERE name = 'Vikings HQ Management';
UPDATE hub_tasks SET name = 'Set the Vikings strategy' WHERE name = 'Vikings Strategy';
UPDATE hub_tasks SET name = 'Post alliance notices' WHERE name = 'Alliance Notices';
UPDATE hub_tasks SET name = 'Run the Bear traps' WHERE name = 'Bear Management';
UPDATE hub_tasks SET name = 'Manage alliance buildings' WHERE name = 'Alliance Building Management';
UPDATE hub_tasks SET name = 'Clear out AFK members' WHERE name = 'AFK Maintenance';
UPDATE hub_tasks SET name = 'Negotiate NAPs' WHERE name = 'NAP Diplomacy';
UPDATE hub_tasks SET name = 'Enforce NAPs' WHERE name = 'NAP Enforcer';
UPDATE hub_tasks SET name = 'Handle cross-server diplomacy' WHERE name = 'Cross-Server Diplomacy';
UPDATE hub_tasks SET name = 'Enforce the rules' WHERE name = 'Rules Enforcer';
UPDATE hub_tasks SET name = 'Coordinate the leaders' WHERE name = 'Co-ordinator';
UPDATE hub_tasks SET name = 'Negotiate the Sanctuary' WHERE name = 'Sanctuary Negotiation';
UPDATE hub_tasks SET name = 'Hand out Sanctuary rewards' WHERE name = 'Sanctuary Reward Distribution';

CREATE TABLE hub_roles (
  id TEXT PRIMARY KEY,
  hub_id TEXT NOT NULL REFERENCES hubs(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 40),
  position INTEGER NOT NULL,
  created_at TEXT NOT NULL
) STRICT;
CREATE INDEX hub_roles_hub ON hub_roles(hub_id, position);

CREATE TABLE hub_role_tasks (
  role_id TEXT NOT NULL REFERENCES hub_roles(id) ON DELETE CASCADE,
  task_id TEXT NOT NULL REFERENCES hub_tasks(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, task_id)
) STRICT;
CREATE INDEX hub_role_tasks_task ON hub_role_tasks(task_id);

CREATE TRIGGER hub_role_limit BEFORE INSERT ON hub_roles
WHEN (SELECT count(*) FROM hub_roles WHERE hub_id = NEW.hub_id) >= 20
BEGIN
  SELECT RAISE(ABORT, 'hub_role_limit');
END;

-- Hubs that exist get the starter roles over the tasks they still have.
INSERT INTO hub_roles (id, hub_id, name, position, created_at) SELECT lower(hex(randomblob(16))), hub_id, 'Signups desk', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now') FROM hub_tasks WHERE name IN ('Run Alliance Championship signups', 'Run Swordland signups', 'Run Tri-Alliance signups') GROUP BY hub_id;
INSERT INTO hub_role_tasks (role_id, task_id) SELECT r.id, t.id FROM hub_roles r JOIN hub_tasks t ON t.hub_id = r.hub_id WHERE r.name = 'Signups desk' AND t.name IN ('Run Alliance Championship signups', 'Run Swordland signups', 'Run Tri-Alliance signups');
INSERT INTO hub_roles (id, hub_id, name, position, created_at) SELECT lower(hex(randomblob(16))), hub_id, 'Vikings', 2, strftime('%Y-%m-%dT%H:%M:%fZ', 'now') FROM hub_tasks WHERE name IN ('Pick the Vikings HQ lineup', 'Set the Vikings strategy') GROUP BY hub_id;
INSERT INTO hub_role_tasks (role_id, task_id) SELECT r.id, t.id FROM hub_roles r JOIN hub_tasks t ON t.hub_id = r.hub_id WHERE r.name = 'Vikings' AND t.name IN ('Pick the Vikings HQ lineup', 'Set the Vikings strategy');
INSERT INTO hub_roles (id, hub_id, name, position, created_at) SELECT lower(hex(randomblob(16))), hub_id, 'Bears and buildings', 3, strftime('%Y-%m-%dT%H:%M:%fZ', 'now') FROM hub_tasks WHERE name IN ('Run the Bear traps', 'Manage alliance buildings') GROUP BY hub_id;
INSERT INTO hub_role_tasks (role_id, task_id) SELECT r.id, t.id FROM hub_roles r JOIN hub_tasks t ON t.hub_id = r.hub_id WHERE r.name = 'Bears and buildings' AND t.name IN ('Run the Bear traps', 'Manage alliance buildings');
INSERT INTO hub_roles (id, hub_id, name, position, created_at) SELECT lower(hex(randomblob(16))), hub_id, 'Diplomacy', 4, strftime('%Y-%m-%dT%H:%M:%fZ', 'now') FROM hub_tasks WHERE name IN ('Negotiate NAPs', 'Enforce NAPs', 'Handle cross-server diplomacy') GROUP BY hub_id;
INSERT INTO hub_role_tasks (role_id, task_id) SELECT r.id, t.id FROM hub_roles r JOIN hub_tasks t ON t.hub_id = r.hub_id WHERE r.name = 'Diplomacy' AND t.name IN ('Negotiate NAPs', 'Enforce NAPs', 'Handle cross-server diplomacy');
INSERT INTO hub_roles (id, hub_id, name, position, created_at) SELECT lower(hex(randomblob(16))), hub_id, 'Sanctuary', 5, strftime('%Y-%m-%dT%H:%M:%fZ', 'now') FROM hub_tasks WHERE name IN ('Negotiate the Sanctuary', 'Hand out Sanctuary rewards') GROUP BY hub_id;
INSERT INTO hub_role_tasks (role_id, task_id) SELECT r.id, t.id FROM hub_roles r JOIN hub_tasks t ON t.hub_id = r.hub_id WHERE r.name = 'Sanctuary' AND t.name IN ('Negotiate the Sanctuary', 'Hand out Sanctuary rewards');
INSERT INTO hub_roles (id, hub_id, name, position, created_at) SELECT lower(hex(randomblob(16))), hub_id, 'Order', 6, strftime('%Y-%m-%dT%H:%M:%fZ', 'now') FROM hub_tasks WHERE name IN ('Enforce the rules', 'Clear out AFK members', 'Post alliance notices', 'Coordinate the leaders') GROUP BY hub_id;
INSERT INTO hub_role_tasks (role_id, task_id) SELECT r.id, t.id FROM hub_roles r JOIN hub_tasks t ON t.hub_id = r.hub_id WHERE r.name = 'Order' AND t.name IN ('Enforce the rules', 'Clear out AFK members', 'Post alliance notices', 'Coordinate the leaders');
