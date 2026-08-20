-- Migration number: 0003

ALTER TABLE users ADD COLUMN is_owner INTEGER NOT NULL DEFAULT 0;

-- Retroactively promote whoever bootstrapped first (existing prod data).
UPDATE users
SET is_owner = 1
WHERE spotify_account_id = (
  SELECT spotify_account_id FROM users ORDER BY created_at ASC LIMIT 1
);

-- Single-use invites the owner creates; an unrecognized login is admitted
-- if an unused invite exists, consuming it.
CREATE TABLE invites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  used_by TEXT NULL REFERENCES users(spotify_account_id),
  used_at TEXT NULL
);
