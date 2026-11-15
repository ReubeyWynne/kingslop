-- A signup sheet locks at the end of the Thursday before its event, so the starter signup tasks fall due then,
-- not on the event day. Only hubs still on the old starter days change; any the owner has edited stay as they are.
UPDATE hub_tasks SET cadence = '{"type":"wheel","days":[4,18]}' WHERE name = 'Swordland Signups' AND cadence = '{"type":"wheel","days":[7,21]}';
UPDATE hub_tasks SET cadence = '{"type":"wheel","days":[18]}' WHERE name = 'Tri-Alliance Signups' AND cadence = '{"type":"wheel","days":[20]}';
