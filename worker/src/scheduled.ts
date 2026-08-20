import { captureSnapshot, type SnapshotEnv } from "./snapshot";
import { getFreshAccessToken, type SpotifyEnv } from "./spotify";

export type ScheduledEnv = SpotifyEnv & SnapshotEnv;

const RETENTION_MONTHS = 12;

/**
 * Captures a snapshot for every opted-in user. One user's failure (revoked
 * consent, expired refresh token, a Spotify error) is caught and logged so
 * it doesn't abort the run for everyone else.
 */
export async function runScheduledSnapshots(env: ScheduledEnv): Promise<void> {
  const users = await env.DB.prepare(
    "SELECT spotify_account_id FROM users WHERE tracking_opt_in = 1",
  ).all<{ spotify_account_id: string }>();

  for (const user of users.results) {
    const accountId = user.spotify_account_id;
    try {
      const accessToken = await getFreshAccessToken(env, accountId);
      if (!accessToken) {
        console.error(`Skipping snapshot for ${accountId}: could not refresh access token`);
        continue;
      }
      await captureSnapshot(env, accountId, accessToken);
    } catch (err) {
      console.error(`Snapshot failed for ${accountId}:`, err);
    }
  }
}

/** Deletes snapshots (and their items) older than the retention window. */
export async function pruneOldSnapshots(env: SnapshotEnv): Promise<void> {
  const cutoff = new Date();
  cutoff.setUTCMonth(cutoff.getUTCMonth() - RETENTION_MONTHS);
  const cutoffDateTime = cutoff.toISOString().slice(0, 19).replace("T", " ");

  await env.DB.batch([
    env.DB.prepare(
      "DELETE FROM snapshot_items WHERE snapshot_id IN (SELECT id FROM snapshots WHERE captured_at < ?)",
    ).bind(cutoffDateTime),
    env.DB.prepare("DELETE FROM snapshots WHERE captured_at < ?").bind(cutoffDateTime),
  ]);
}
