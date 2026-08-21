import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TrendChart } from "./TrendChart";

function jsonResponse(body: unknown, status = 200) {
  return { ok: status < 400, status, statusText: "", json: async () => body };
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

  it("defaults to tracking 5 items and switches count without an extra fetch", async () => {
    const topItems = Array.from({ length: 10 }, (_, i) => ({ id: `t${i}`, name: `Song ${i}` }));
    const snapshots = [
      { capturedAt: "2026-08-18", items: topItems.map((t, i) => ({ id: t.id, rank: i + 1 })) },
      { capturedAt: "2026-08-19", items: topItems.map((t, i) => ({ id: t.id, rank: i + 1 })) },
    ];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.startsWith("/api/top")) return jsonResponse({ items: topItems });
      if (url.startsWith("/api/trend")) return jsonResponse({ snapshots });
      throw new Error(`Unexpected fetch to ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<TrendChart />);

    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(5));
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole("button", { name: "10" }));

    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(10));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("shows a day label for each plotted snapshot, plus one month tag for the first point", async () => {
    mockFetches(
      [{ id: "t1", name: "Song One" }],
      [
        { capturedAt: "2026-08-18 06:00:00", items: [{ id: "t1", rank: 2 }] },
        { capturedAt: "2026-08-19 06:00:00", items: [{ id: "t1", rank: 1 }] },
      ],
    );

    render(<TrendChart />);

    expect(await screen.findByText("18")).toBeInTheDocument();
    expect(screen.getByText("19")).toBeInTheDocument();
    expect(screen.getAllByText("Aug")).toHaveLength(1);
  });

  it("adds a second month tag where the visible window crosses a month boundary", async () => {
    mockFetches(
      [{ id: "t1", name: "Song One" }],
      [
        { capturedAt: "2026-07-31 06:00:00", items: [{ id: "t1", rank: 2 }] },
        { capturedAt: "2026-08-01 06:00:00", items: [{ id: "t1", rank: 1 }] },
      ],
    );

    render(<TrendChart />);

    expect(await screen.findByText("Jul")).toBeInTheDocument();
    expect(screen.getByText("Aug")).toBeInTheDocument();
  });

  it("defaults to a 2-week window and switches time frame without an extra fetch", async () => {
    const topItems = [{ id: "t1", name: "Song One" }];
    const snapshots = Array.from({ length: 20 }, (_, i) => ({
      capturedAt: `2026-07-${String(i + 1).padStart(2, "0")} 08:00:00`,
      items: [{ id: "t1", rank: 1 }],
    }));
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.startsWith("/api/top")) return jsonResponse({ items: topItems });
      if (url.startsWith("/api/trend")) return jsonResponse({ snapshots });
      throw new Error(`Unexpected fetch to ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { container } = render(<TrendChart />);

    await waitFor(() => expect(container.querySelectorAll(".axis-day")).toHaveLength(14));

    fireEvent.click(screen.getByRole("button", { name: "1 week" }));

    await waitFor(() => expect(container.querySelectorAll(".axis-day")).toHaveLength(7));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("highlights the matching line and dims others when hovering a legend entry", async () => {
    mockFetches(
      [
        { id: "t1", name: "Song One" },
        { id: "t2", name: "Song Two" },
      ],
      [
        { capturedAt: "2026-08-18 06:00:00", items: [{ id: "t1", rank: 2 }, { id: "t2", rank: 1 }] },
        { capturedAt: "2026-08-19 06:00:00", items: [{ id: "t1", rank: 1 }, { id: "t2", rank: 2 }] },
      ],
    );

    const { container } = render(<TrendChart />);
    await screen.findByText("Song One");

    const hoveredLine = () =>
      container.querySelectorAll('[data-series-id="t1"] polyline')[1];
    const otherLine = () =>
      container.querySelectorAll('[data-series-id="t2"] polyline')[1];

    expect(hoveredLine()).toHaveAttribute("stroke-width", "2");

    fireEvent.mouseEnter(screen.getByText("Song One").closest("li")!);

    expect(hoveredLine()).toHaveAttribute("stroke-width", "4");
    expect(otherLine()).toHaveAttribute("opacity", "0.25");

    fireEvent.mouseLeave(screen.getByText("Song One").closest("li")!);

    expect(hoveredLine()).toHaveAttribute("stroke-width", "2");
    expect(otherLine()).toHaveAttribute("opacity", "1");
  });

  it("highlights the matching legend entry when hovering a line", async () => {
    mockFetches(
      [{ id: "t1", name: "Song One" }],
      [
        { capturedAt: "2026-08-18 06:00:00", items: [{ id: "t1", rank: 2 }] },
        { capturedAt: "2026-08-19 06:00:00", items: [{ id: "t1", rank: 1 }] },
      ],
    );

    const { container } = render(<TrendChart />);
    await screen.findByText("Song One");

    fireEvent.mouseEnter(container.querySelector('[data-series-id="t1"]')!);

    expect(screen.getByText("Song One").closest("li")).toHaveStyle({ fontWeight: "600" });
  });

  it("renders nothing when not signed in", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ error: "Not signed in." }, 401)),
    );

    const { container } = render(<TrendChart />);

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("shows the server's error message when a request fails for a reason other than auth", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ error: "Spotify rate limited us." }, 502)),
    );

    render(<TrendChart />);

    expect(await screen.findByText(/spotify rate limited us/i)).toBeInTheDocument();
  });
});
