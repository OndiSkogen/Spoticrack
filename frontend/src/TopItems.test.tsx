import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TopItems } from "./TopItems";

function jsonResponse(body: unknown, status = 200) {
  return { ok: status < 400, status, statusText: "", json: async () => body };
}

describe("TopItems", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches tracks for the default time range on mount and renders them", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        items: [{ id: "t1", name: "Song One", artists: "Artist A", albumImage: null }],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<TopItems />);

    expect(await screen.findByText(/song one/i)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/top?type=tracks&time_range=medium_term");
  });

  it("switches to artists and refetches with the artists type", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ items: [] }))
      .mockResolvedValueOnce(
        jsonResponse({
          items: [{ id: "a1", name: "Band X", image: null }],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<TopItems />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: /^artists$/i }));

    expect(await screen.findByText(/band x/i)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/top?type=artists&time_range=medium_term",
    );
  });

  it("switches time range and refetches with the new time_range", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ items: [] }));
    vi.stubGlobal("fetch", fetchMock);

    render(<TopItems />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: /last 4 weeks/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenLastCalledWith(
        "/api/top?type=tracks&time_range=short_term",
      ),
    );
  });

  it("defaults to showing 10 results", async () => {
    const items = Array.from({ length: 50 }, (_, i) => ({
      id: `t${i}`,
      name: `Song ${i}`,
      artists: "Artist",
      albumImage: null,
    }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ items })));

    render(<TopItems />);

    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(10));
    expect(screen.getByRole("button", { name: "10" })).toHaveAttribute("aria-pressed", "true");
  });

  it("switches result count by slicing the already-fetched items, without a new fetch", async () => {
    const items = Array.from({ length: 50 }, (_, i) => ({
      id: `t${i}`,
      name: `Song ${i}`,
      artists: "Artist",
      albumImage: null,
    }));
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ items }));
    vi.stubGlobal("fetch", fetchMock);

    render(<TopItems />);
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(10));

    fireEvent.click(screen.getByRole("button", { name: "50" }));

    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(50));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("renders nothing when not signed in", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ error: "Not signed in." }, 401)),
    );

    const { container } = render(<TopItems />);

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("shows the server's error message when the request fails for a reason other than auth", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ error: "Spotify rate limited us." }, 502)),
    );

    render(<TopItems />);

    expect(await screen.findByText(/spotify rate limited us/i)).toBeInTheDocument();
  });
});
