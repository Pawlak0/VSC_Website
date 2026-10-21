-- Links a member chose to show on their profile on the website: a button to message them on Discord, and their Steam
-- profile. Both stay off until the member turns them on from their account page.
ALTER TABLE members ADD COLUMN show_discord INTEGER NOT NULL DEFAULT 0;
ALTER TABLE members ADD COLUMN steam TEXT;
