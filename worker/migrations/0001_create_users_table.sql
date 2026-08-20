-- Migration number: 0001 	 2026-08-20T12:34:29.686Z

CREATE TABLE users (
  -- Spotify's /v1/me `account_id` field - not `id`, which Spotify's own
  -- docs say not to use for account linking.
  spotify_account_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  refresh_token_enc TEXT NOT NULL,
  tracking_opt_in INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
