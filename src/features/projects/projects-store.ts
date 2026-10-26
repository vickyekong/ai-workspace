import { createStore } from "zustand/vanilla";
import { toAppError } from "@/services/ipc";
import type { ProjectRepository } from "@/services/persistence/types";
import type { Project, ProjectInput } from "@/types/domain";

export interface ProjectsState {
  projects: Project[];
  loaded: boolean;
  error: string | null;
  load(): Promise<void>;
  create(input: ProjectInput): Promise<Project | null>;
  update(id: string, input: ProjectInput): Promise<Project | null>;
  remove(id: string): Promise<boolean>;
}

export interface ProjectsStoreOptions {
  /** Called after a project is deleted so dependent stores can refresh assignments. */
  onRemoved?: (id: string) => void;
}

export function createProjectsStore(repo: ProjectRepository, options: ProjectsStoreOptions = {}) {
  return createStore<ProjectsState>()((set) => {
    const fail = (error: unknown) => set({ error: toAppError(error).message });

    return {
      projects: [],
      loaded: false,
      error: null,

      async load() {
        try {
          set({ projects: await repo.list(), loaded: true, error: null });
        } catch (error) {
          set({ loaded: true });
          fail(error);
        }
      },

      async create(input) {
        try {
          const project = await repo.create(input);
          set((s) => ({ projects: [project, ...s.projects], error: null }));
          return project;
        } catch (error) {
          fail(error);
          return null;
        }
      },

      async update(id, input) {
        try {
          const project = await repo.update(id, input);
          set((s) => ({ projects: s.projects.map((p) => (p.id === id ? project : p)), error: null }));
          return project;
        } catch (error) {
          fail(error);
          return null;
        }
      },

      async remove(id) {
        try {
          await repo.delete(id);
          set((s) => ({ projects: s.projects.filter((p) => p.id !== id) }));
          options.onRemoved?.(id);
          return true;
        } catch (error) {
          fail(error);
          return false;
        }
      },
    };
  });
}

export type ProjectsStore = ReturnType<typeof createProjectsStore>;
