-- Each player's own city garrison capacity, so leaders can pick the largest to captain the HQ. NULL is not given yet.
ALTER TABLE registrations ADD COLUMN garrison_capacity INTEGER;
