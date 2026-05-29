import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { App } from "./App.js";
import { Home } from "./pages/Home.js";
import { PRView } from "./pages/PRView.js";
import { Skills } from "./pages/Skills.js";
import { Settings } from "./pages/Settings.js";
import "./styles.css";
import { initTheme } from "./theme.js";

initTheme();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<App />}>
          <Route index element={<Home />} />
          <Route path="pr/:prId" element={<PRView />} />
          <Route path="repos/:repoId/skills" element={<Skills />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
