import { fetchWithBackoff } from "./spotify";

export type SnapshotEnv = {
  DB: D1Database;
};

const TOP_TIME_RANGES = ["short_term", "medium_term", "long_term"] as const;
const TOP_TYPES = [
  ["tracks", "track"],
  ["artists", "artist"],
] as const;

export type SnapshotResult = { timeRange: string; snapshotId: number };

/**
 * Captures one snapshot per time range for a user: their current top
 * tracks and artists, stored as ID + rank only (no names, images, or
 * other Spotify content - see the PRD's caching-compliance mitigation).
 * Reused by both the manual "capture now" route and the scheduled cron.
 */
export async function captureSnapshot(
  env: SnapshotEnv,
  accountId: string,
  accessToken: string,
): Promise<SnapshotResult[]> {
  const results: SnapshotResult[] = [];

  for (const timeRange of TOP_TIME_RANGES) {
    const inserted = await env.DB.prepare(
      "INSERT INTO snapshots (user_id, time_range) VALUES (?, ?)",
    )
      .bind(accountId, timeRange)
      .run();
    const snapshotId = inserted.meta.last_row_id;

    for (const [type, itemType] of TOP_TYPES) {
      const url = new URL(`https://api.spotify.com/v1/me/top/${type}`);
      url.searchParams.set("time_range", timeRange);
      url.searchParams.set("limit", "50");

      const res = await fetchWithBackoff(() =>
        fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } }),
      );
      if (!res.ok) continue;

      const data = await res.json<{ items: { id: string }[] }>();
      if (data.items.length === 0) continue;

      const stmt = env.DB.prepare(
        "INSERT INTO snapshot_items (snapshot_id, item_type, rank, spotify_id) VALUES (?, ?, ?, ?)",
      );
      await env.DB.batch(
        data.items.map((item, i) => stmt.bind(snapshotId, itemType, i + 1, item.id)),
      );
    }

    results.push({ timeRange, snapshotId });
  }

  return results;
}
