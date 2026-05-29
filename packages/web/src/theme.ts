export type Theme = "system" | "dark" | "light";

const KEY = "reviewer.theme";

export function getTheme(): Theme {
  const v = localStorage.getItem(KEY);
  if (v === "dark" || v === "light" || v === "system") return v;
  return "system";
}

export function setTheme(t: Theme): void {
  localStorage.setItem(KEY, t);
  applyTheme(t);
}

export function applyTheme(t: Theme): void {
  document.documentElement.setAttribute("data-theme", t);
}

export function initTheme(): void {
  applyTheme(getTheme());
}
