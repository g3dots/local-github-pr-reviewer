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

/**
 * Subscribe to the active theme by observing `data-theme` on <html>, so renderers
 * that take an explicit theme (e.g. `@pierre/diffs`) re-render when the user
 * toggles it. Returns the current value and an unsubscribe fn.
 */
export function subscribeTheme(cb: (t: Theme) => void): () => void {
  const read = (): Theme => {
    const v = document.documentElement.getAttribute("data-theme");
    return v === "dark" || v === "light" || v === "system" ? v : "system";
  };
  const obs = new MutationObserver(() => cb(read()));
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => obs.disconnect();
}
