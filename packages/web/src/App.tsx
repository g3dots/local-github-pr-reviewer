import { useState } from "react";
import { Link, Outlet } from "react-router-dom";
import { getTheme, setTheme, type Theme } from "./theme.js";

const NEXT: Record<Theme, Theme> = { system: "dark", dark: "light", light: "system" };
const ICON: Record<Theme, string> = { system: "🖥", dark: "🌙", light: "☀" };
const LABEL: Record<Theme, string> = { system: "System", dark: "Dark", light: "Light" };

export function App() {
  const [theme, setT] = useState<Theme>(getTheme());

  function cycle() {
    const next = NEXT[theme];
    setTheme(next);
    setT(next);
  }

  return (
    <div className="app">
      <nav className="topbar">
        <Link to="/" className="brand">
          <span className="mark">R</span>
          <span>Reviewer</span>
          <span className="brand-sep">/</span>
          <span className="brand-sub">pull requests</span>
        </Link>
        <div className="spacer" />
        <button
          className="btn small"
          onClick={cycle}
          title={`Theme: ${LABEL[theme]} (click to cycle)`}
        >
          {ICON[theme]} {LABEL[theme]}
        </button>
        <Link to="/settings" className="nav-link">
          Settings
        </Link>
      </nav>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
