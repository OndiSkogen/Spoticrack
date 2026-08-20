import { afterEach, describe, expect, it, vi } from "vitest";
import { apiUrl } from "./api";

describe("apiUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns the path unchanged when no API base is configured", () => {
    vi.stubEnv("VITE_API_BASE_URL", "");
    expect(apiUrl("/api/health")).toBe("/api/health");
  });

  it("prefixes the path with the configured API base", () => {
    vi.stubEnv(
      "VITE_API_BASE_URL",
      "https://spoticrack-worker.spoticrack.workers.dev",
    );
    expect(apiUrl("/api/health")).toBe(
      "https://spoticrack-worker.spoticrack.workers.dev/api/health",
    );
  });
});
