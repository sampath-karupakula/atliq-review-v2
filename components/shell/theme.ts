// Light, dark or follow the system. Stored per browser; applied as data-theme on <html> so the CSS tokens switch.
export type Theme = "light" | "dark" | "system";
const KEY = "atliq-theme";

export function applyTheme(t: Theme) {
  const root = document.documentElement;
  if (t === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", t);
}

export function setTheme(t: Theme) {
  try {
    if (t === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, t);
  } catch {
    // Storage may be unavailable (private window); the choice then lasts for this page only.
  }
  applyTheme(t);
}

export function readTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}
