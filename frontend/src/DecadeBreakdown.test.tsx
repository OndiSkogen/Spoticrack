import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DecadeBreakdown } from "./DecadeBreakdown";

function jsonResponse(body: unknown, status = 200) {
  return { ok: status < 400, status, statusText: "", json: async () => body };
}

describe("DecadeBreakdown", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches top tracks and renders individual years grouped under their decade", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        items: [
          { id: "t1", name: "A", artists: "X", albumImage: null, releaseYear: 2015 },
          { id: "t2", name: "B", artists: "Y", albumImage: null, releaseYear: 1998 },
          { id: "t3", name: "C", artists: "Z", albumImage: null, releaseYear: 2015 },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<DecadeBreakdown />);

    // Decade group headers, chronological order, with the group's total.
    const headers = await screen.findAllByRole("heading", { level: 3 });
    expect(headers.map((h) => h.textContent)).toEqual(["1990s", "2010s"]);
    expect(fetchMock).toHaveBeenCalledWith("/api/top?type=tracks&time_range=medium_term");

    // Individual years, each its own row, nested under their decade.
    const years = screen.getAllByRole("listitem");
    expect(years[0]).toHaveTextContent("1998");
    expect(years[1]).toHaveTextContent("2015");
  });

  it("renders nothing when not signed in", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ error: "Not signed in." }, 401)),
    );

    const { container } = render(<DecadeBreakdown />);

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("shows the server's error message when the request fails for a reason other than auth", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ error: "Spotify rate limited us." }, 502)),
    );

    render(<DecadeBreakdown />);

    expect(await screen.findByText(/spotify rate limited us/i)).toBeInTheDocument();
  });
});
