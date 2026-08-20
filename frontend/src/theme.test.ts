import { afterEach, describe, expect, it } from "vitest";
import { applyTheme, getStoredTheme, setStoredTheme, THEMES } from "./theme";

describe("theme", () => {
  afterEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  describe("getStoredTheme", () => {
    it("returns the default theme when nothing is stored", () => {
      expect(getStoredTheme()).toBe("chart-topper");
    });

    it("returns the stored theme when it's valid", () => {
      localStorage.setItem("spoticrack-theme", "studio-console");
      expect(getStoredTheme()).toBe("studio-console");
    });

    it("falls back to the default when the stored value isn't a known theme", () => {
      localStorage.setItem("spoticrack-theme", "not-a-real-theme");
      expect(getStoredTheme()).toBe("chart-topper");
    });
  });

  describe("setStoredTheme", () => {
    it("persists the theme so a later getStoredTheme call returns it", () => {
      setStoredTheme("vinyl-liner-notes");
      expect(getStoredTheme()).toBe("vinyl-liner-notes");
    });
  });

  describe("applyTheme", () => {
    it("sets data-theme on the document root", () => {
      applyTheme("studio-console");
      expect(document.documentElement.getAttribute("data-theme")).toBe("studio-console");
    });
  });

  it("lists all three themes with friendly labels", () => {
    expect(THEMES.map((t) => t.id)).toEqual([
      "studio-console",
      "vinyl-liner-notes",
      "chart-topper",
    ]);
    expect(THEMES.every((t) => t.label.length > 0)).toBe(true);
  });
});
