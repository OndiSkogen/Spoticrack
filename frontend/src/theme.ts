export const THEMES = [
  { id: "studio-console", label: "Studio Console" },
  { id: "vinyl-liner-notes", label: "Vinyl Liner Notes" },
  { id: "chart-topper", label: "Chart-Topper" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

const STORAGE_KEY = "spoticrack-theme";
const DEFAULT_THEME: ThemeId = "chart-topper";

function isThemeId(value: string | null): value is ThemeId {
  return THEMES.some((t) => t.id === value);
}

export function getStoredTheme(): ThemeId {
  const stored = localStorage.getItem(STORAGE_KEY);
  return isThemeId(stored) ? stored : DEFAULT_THEME;
}

export function setStoredTheme(theme: ThemeId): void {
  localStorage.setItem(STORAGE_KEY, theme);
}

export function applyTheme(theme: ThemeId): void {
  document.documentElement.setAttribute("data-theme", theme);
}
