export const THEMES = ["system", "light", "dark"] as const;
export type ThemePreference = (typeof THEMES)[number];

export const ACCENTS = ["blue", "violet", "teal", "amber", "graphite"] as const;
export type AccentColor = (typeof ACCENTS)[number];

export interface AppSettings {
  theme: ThemePreference;
  accent: AccentColor;
  reduceMotion: boolean;
  sidebarCollapsed: boolean;
  sendOnEnter: boolean;
  defaultProviderId: string;
}

export const DEFAULT_SETTINGS: Readonly<AppSettings> = Object.freeze({
  theme: "system",
  accent: "blue",
  reduceMotion: false,
  sidebarCollapsed: false,
  sendOnEnter: true,
  defaultProviderId: "mock",
});

const oneOf = <T extends string>(values: readonly T[], value: unknown, fallback: T): T =>
  typeof value === "string" && (values as readonly string[]).includes(value) ? (value as T) : fallback;

const bool = (value: unknown, fallback: boolean) => (typeof value === "boolean" ? value : fallback);

/** Coerces untrusted persisted data into valid settings, field by field. */
export function normalizeSettings(raw: unknown): AppSettings {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const d = DEFAULT_SETTINGS;
  return {
    theme: oneOf(THEMES, src.theme, d.theme),
    accent: oneOf(ACCENTS, src.accent, d.accent),
    reduceMotion: bool(src.reduceMotion, d.reduceMotion),
    sidebarCollapsed: bool(src.sidebarCollapsed, d.sidebarCollapsed),
    sendOnEnter: bool(src.sendOnEnter, d.sendOnEnter),
    defaultProviderId:
      typeof src.defaultProviderId === "string" && src.defaultProviderId.length > 0
        ? src.defaultProviderId
        : d.defaultProviderId,
  };
}

export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): "light" | "dark" {
  if (preference === "system") return systemPrefersDark ? "dark" : "light";
  return preference;
}
