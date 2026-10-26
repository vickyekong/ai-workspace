import { describe, expect, it } from "vitest";
import { createMemoryBackend } from "@/services/persistence/memory";
import type { SettingsRepository } from "@/services/persistence/types";
import { DEFAULT_SETTINGS, normalizeSettings, resolveTheme } from "./settings-model";
import { createSettingsStore } from "./settings-store";

describe("normalizeSettings", () => {
  it("returns defaults for missing or malformed input", () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings("dark")).toEqual(DEFAULT_SETTINGS);
  });

  it("keeps valid fields and replaces invalid ones individually", () => {
    const result = normalizeSettings({
      theme: "dark",
      accent: "neon",
      sendOnEnter: "yes",
      reduceMotion: true,
      defaultProviderId: "",
      unknown: 1,
    });
    expect(result).toEqual({
      ...DEFAULT_SETTINGS,
      theme: "dark",
      reduceMotion: true,
    });
    expect(result).not.toHaveProperty("unknown");
  });
});

describe("resolveTheme", () => {
  it("follows the system only when set to system", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
  });
});

describe("settings store", () => {
  it("loads, updates, and persists settings", async () => {
    const { settings } = createMemoryBackend();
    const store = createSettingsStore(settings);
    await store.getState().load();
    expect(store.getState().loaded).toBe(true);

    await store.getState().update({ theme: "dark", accent: "teal" });
    expect(store.getState().settings.theme).toBe("dark");
    expect(normalizeSettings(await settings.load())).toMatchObject({ theme: "dark", accent: "teal" });

    const reloaded = createSettingsStore(settings);
    await reloaded.getState().load();
    expect(reloaded.getState().settings.accent).toBe("teal");
  });

  it("rolls back and reports when saving fails", async () => {
    const failing: SettingsRepository = {
      load: async () => ({ theme: "light" }),
      save: async () => {
        throw { kind: "database", message: "disk full" };
      },
    };
    const store = createSettingsStore(failing);
    await store.getState().load();
    await store.getState().update({ theme: "dark" });
    expect(store.getState().settings.theme).toBe("light");
    expect(store.getState().error).toBe("disk full");
  });
});
