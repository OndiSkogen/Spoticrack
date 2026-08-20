import { afterEach, describe, expect, it, vi } from "vitest";
import { apiGet, apiPost, SESSION_EXPIRED_EVENT } from "./api";

function jsonResponse(body: unknown, status = 200) {
  return { ok: status < 400, status, statusText: "", json: async () => body };
}

describe("apiGet", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns ok with the parsed body on success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ hello: "world" })));

    const result = await apiGet<{ hello: string }>("/api/thing");

    expect(result).toEqual({ kind: "ok", data: { hello: "world" } });
  });

  it("returns unauthenticated and dispatches the session-expired event on 401", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: "nope" }, 401)));
    const listener = vi.fn();
    window.addEventListener(SESSION_EXPIRED_EVENT, listener);

    const result = await apiGet("/api/thing");

    expect(result).toEqual({ kind: "unauthenticated" });
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener(SESSION_EXPIRED_EVENT, listener);
  });

  it("returns the server's error message for other non-ok responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ error: "Spotify rate limited us." }, 429)),
    );

    const result = await apiGet("/api/thing");

    expect(result).toEqual({ kind: "error", message: "Spotify rate limited us." });
  });

  it("falls back to statusText when the error body isn't JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        json: async () => {
          throw new Error("not json");
        },
      }),
    );

    const result = await apiGet("/api/thing");

    expect(result).toEqual({ kind: "error", message: "Internal Server Error" });
  });
});

describe("apiPost", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends a JSON body and returns ok on success", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await apiPost("/api/thing", { foo: "bar" });

    expect(result).toEqual({ kind: "ok", data: { ok: true } });
    expect(fetchMock).toHaveBeenCalledWith("/api/thing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ foo: "bar" }),
    });
  });

  it("posts with no body when none is given", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await apiPost("/api/thing");

    expect(fetchMock).toHaveBeenCalledWith("/api/thing", { method: "POST" });
  });
});
