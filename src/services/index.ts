import { isTauri } from "@tauri-apps/api/core";
import { createMockAi } from "./ai/mock";
import { tauriAi } from "./ai/tauri";
import type { AiService } from "./ai/types";
import { createMemoryBackend } from "./persistence/memory";
import {
  tauriConversations,
  tauriDocuments,
  tauriProjects,
  tauriSettings,
  tauriSystem,
} from "./persistence/tauri";
import type {
  ConversationRepository,
  DocumentRepository,
  ProjectRepository,
  SettingsRepository,
  SystemService,
} from "./persistence/types";

export interface Services {
  runtime: "desktop" | "browser";
  conversations: ConversationRepository;
  projects: ProjectRepository;
  documents: DocumentRepository;
  settings: SettingsRepository;
  system: SystemService;
  ai: AiService;
}

export function createServices(): Services {
  if (isTauri()) {
    return {
      runtime: "desktop",
      conversations: tauriConversations,
      projects: tauriProjects,
      documents: tauriDocuments,
      settings: tauriSettings,
      system: tauriSystem,
      ai: tauriAi,
    };
  }
  return { runtime: "browser", ...createMemoryBackend(), ai: createMockAi() };
}
