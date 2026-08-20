import { describe, expect, it } from "vitest";
import { isLocalHost } from "./env";

describe("isLocalHost", () => {
  it("returns true for localhost", () => {
    expect(isLocalHost("localhost")).toBe(true);
  });

  it("returns true for 127.0.0.1", () => {
    expect(isLocalHost("127.0.0.1")).toBe(true);
  });

  it("returns false for the deployed production domain", () => {
    expect(isLocalHost("spoticrack-worker.spoticrack.workers.dev")).toBe(false);
  });
});
