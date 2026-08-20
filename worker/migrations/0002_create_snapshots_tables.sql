-- Migration number: 0002 	 2026-08-20T14:25:39.756Z

-- One row per (user, time_range) captured at a point in time.
-- Deliberately holds no Spotify content - see snapshot_items.
CREATE TABLE snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(spotify_account_id),
  time_range TEXT NOT NULL,
  captured_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ID + rank only, per the PRD's caching-compliance mitigation - names,
-- images, and other Spotify content are re-hydrated live at read time,
-- never persisted here.
CREATE TABLE snapshot_items (
  snapshot_id INTEGER NOT NULL REFERENCES snapshots(id),
  item_type TEXT NOT NULL, -- 'track' | 'artist'
  rank INTEGER NOT NULL,
  spotify_id TEXT NOT NULL
);

CREATE INDEX idx_snapshots_user_time_range ON snapshots(user_id, time_range);
CREATE INDEX idx_snapshot_items_snapshot ON snapshot_items(snapshot_id);
