-- A plan is now an alliance room: it keeps its weekday and start time, and each
-- registration records which event start its player last answered for.
ALTER TABLE plans ADD COLUMN event_day TEXT CHECK (event_day IN ('tue', 'thu'));
ALTER TABLE plans ADD COLUMN event_time TEXT CHECK (event_time GLOB '[0-2][0-9]:[0-5][0-9]');
ALTER TABLE registrations ADD COLUMN signed_for TEXT;
ALTER TABLE registrations ADD COLUMN attending INTEGER CHECK (attending IN (0, 1));
