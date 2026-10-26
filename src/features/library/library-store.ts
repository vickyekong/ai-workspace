import { createStore } from "zustand/vanilla";
import { toAppError } from "@/services/ipc";
import type { DocumentRepository } from "@/services/persistence/types";
import type { ImportResult, LibraryDocument } from "@/types/domain";

export interface LibraryState {
  documents: LibraryDocument[];
  loaded: boolean;
  importing: boolean;
  error: string | null;
  load(): Promise<void>;
  importDocuments(): Promise<ImportResult | null>;
  setProject(id: string, projectId: string | null): Promise<void>;
  remove(id: string): Promise<void>;
  reveal(id: string): Promise<void>;
}

export function createLibraryStore(repo: DocumentRepository) {
  return createStore<LibraryState>()((set, get) => {
    const fail = (error: unknown) => set({ error: toAppError(error).message });

    return {
      documents: [],
      loaded: false,
      importing: false,
      error: null,

      async load() {
        try {
          set({ documents: await repo.list(), loaded: true, error: null });
        } catch (error) {
          set({ loaded: true });
          fail(error);
        }
      },

      async importDocuments() {
        if (get().importing) return null;
        set({ importing: true, error: null });
        try {
          const result = await repo.importFromPicker();
          if (result.imported.length > 0) {
            set((s) => ({ documents: [...result.imported, ...s.documents] }));
          }
          return result;
        } catch (error) {
          fail(error);
          return null;
        } finally {
          set({ importing: false });
        }
      },

      async setProject(id, projectId) {
        try {
          const updated = await repo.setProject(id, projectId);
          set((s) => ({ documents: s.documents.map((d) => (d.id === id ? updated : d)) }));
        } catch (error) {
          fail(error);
        }
      },

      async remove(id) {
        try {
          await repo.remove(id);
          set((s) => ({ documents: s.documents.filter((d) => d.id !== id) }));
        } catch (error) {
          fail(error);
        }
      },

      async reveal(id) {
        try {
          await repo.reveal(id);
        } catch (error) {
          fail(error);
        }
      },
    };
  });
}

export type LibraryStore = ReturnType<typeof createLibraryStore>;
