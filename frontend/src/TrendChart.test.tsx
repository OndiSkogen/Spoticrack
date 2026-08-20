import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TrendChart } from "./TrendChart";

function jsonResponse(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body };
}

function mockFetches(topItems: { id: string; name: string }[], snapshots: unknown[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.startsWith("/api/top")) return jsonResponse({ items: topItems });
      if (url.startsWith("/api/trend")) return jsonResponse({ snapshots });
      throw new Error(`Unexpected fetch to ${url}`);
    }),
  );
}

describe("TrendChart", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders nothing when there are fewer than 2 snapshots", async () => {
    mockFetches([{ id: "t1", name: "Song One" }], [{ capturedAt: "2026-08-19", items: [] }]);

    const { container } = render(<TrendChart />);

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("renders a legend entry per tracked track once there's enough history", async () => {
    mockFetches(
      [
        { id: "t1", name: "Song One" },
        { id: "t2", name: "Song Two" },
      ],
      [
        { capturedAt: "2026-08-18", items: [{ id: "t1", rank: 2 }, { id: "t2", rank: 1 }] },
        { capturedAt: "2026-08-19", items: [{ id: "t1", rank: 1 }, { id: "t2", rank: 2 }] },
      ],
    );

    render(<TrendChart />);

    expect(await screen.findByText(/Song One/)).toBeInTheDocument();
    expect(screen.getByText(/Song Two/)).toBeInTheDocument();
  });

  it("renders nothing when not signed in", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ error: "Not signed in." }, 401)),
    );

    const { container } = render(<TrendChart />);

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
