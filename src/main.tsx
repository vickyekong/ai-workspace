import React from "react";
import ReactDOM from "react-dom/client";
import { isTauri } from "@tauri-apps/api/core";
import { App } from "./app/app";
import "./index.css";

if (isTauri()) {
  // Enables the translucent sidebar styles that sit over the native vibrancy view.
  document.documentElement.classList.add("native");
}

if (import.meta.env.PROD) {
  // Keep WebKit's "Reload"/"Inspect" menu out of the shipped app; text fields keep theirs.
  document.addEventListener("contextmenu", (event) => {
    const target = event.target as HTMLElement | null;
    if (!target?.closest("input, textarea, [contenteditable='true'], .selectable")) event.preventDefault();
  });
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
