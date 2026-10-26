import { useEffect, useSyncExternalStore } from "react";
import { resolveTheme } from "@/features/settings/settings-model";
import { services, useSettings } from "./stores";

const query = window.matchMedia("(prefers-color-scheme: dark)");
const subscribe = (cb: () => void) => {
  query.addEventListener("change", cb);
  return () => query.removeEventListener("change", cb);
};

export function useSystemPrefersDark(): boolean {
  return useSyncExternalStore(subscribe, () => query.matches);
}

/** Applies theme + accent to <html> and keeps the native window appearance in sync. */
export function useApplyTheme(): "light" | "dark" {
  const theme = useSettings((s) => s.settings.theme);
  const accent = useSettings((s) => s.settings.accent);
  const systemDark = useSystemPrefersDark();
  const resolved = resolveTheme(theme, systemDark);

  useEffect(() => {
    const root = document.documentElement;
    // Swap palettes in a single frame instead of cross-fading every transitioned color.
    root.classList.add("theme-switching");
    root.classList.toggle("dark", resolved === "dark");
    root.dataset.accent = accent;
    const frame = requestAnimationFrame(() =>
      requestAnimationFrame(() => root.classList.remove("theme-switching")),
    );
    return () => cancelAnimationFrame(frame);
  }, [resolved, accent]);

  useEffect(() => {
    // Drives the NSVisualEffectView material so vibrancy matches the chosen theme.
    services.system.setWindowTheme(theme === "system" ? null : theme).catch(() => {});
  }, [theme]);

  return resolved;
}
