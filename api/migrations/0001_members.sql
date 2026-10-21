-- Members who have signed in with Discord. Nothing else about them is kept: no email, no roles, no Discord tokens.
CREATE TABLE members (
  id TEXT PRIMARY KEY,            -- Discord user ID
  name TEXT NOT NULL,             -- nickname on the clan server, else Discord display name
  avatar TEXT NOT NULL,           -- link to the avatar picture on Discord
  first_seen INTEGER NOT NULL,    -- first sign-in, ms since 1970
  last_login INTEGER NOT NULL,    -- latest sign-in
  checked_at INTEGER NOT NULL,    -- when the Völsung Clansman role was last confirmed
  left_at INTEGER                 -- when the role was found missing; the account is deleted 4 months later
);

-- One row per signed-in browser. Only a SHA-256 hash of the cookie is stored, so the table cannot be used to sign in.
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES members (id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_member ON sessions (member_id);

-- Sign-in attempts per minute, by a hash of the network address; rows older than an hour are deleted.
CREATE TABLE hits (
  key TEXT NOT NULL,
  minute INTEGER NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (key, minute)
);
