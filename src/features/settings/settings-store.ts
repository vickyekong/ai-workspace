import { createStore } from "zustand/vanilla";
import { toAppError } from "@/services/ipc";
import type { SettingsRepository } from "@/services/persistence/types";
import { DEFAULT_SETTINGS, normalizeSettings, type AppSettings } from "./settings-model";

export interface SettingsState {
  settings: AppSettings;
  loaded: boolean;
  error: string | null;
  load(): Promise<void>;
  update(patch: Partial<AppSettings>): Promise<void>;
}

export function createSettingsStore(repo: SettingsRepository) {
  // Serialize writes so a slow save can't overwrite a newer one.
  let queue = Promise.resolve();

  return createStore<SettingsState>()((set, get) => ({
    settings: { ...DEFAULT_SETTINGS },
    loaded: false,
    error: null,

    async load() {
      try {
        const raw = await repo.load();
        set({ settings: normalizeSettings(raw), loaded: true, error: null });
      } catch (error) {
        set({ loaded: true, error: toAppError(error).message });
      }
    },

    update(patch) {
      const previous = get().settings;
      const next = normalizeSettings({ ...previous, ...patch });
      set({ settings: next, error: null });
      queue = queue.then(async () => {
        try {
          await repo.save(next);
        } catch (error) {
          if (get().settings === next) set({ settings: previous });
          set({ error: toAppError(error).message });
        }
      });
      return queue;
    },
  }));
}

export type SettingsStore = ReturnType<typeof createSettingsStore>;
