import { getCurrentWindow } from "@tauri-apps/api/window";
import { call } from "@/services/ipc";
import type {
  AppInfo,
  Conversation,
  ImportResult,
  LibraryDocument,
  Message,
  Project,
} from "@/types/domain";
import type {
  ConversationRepository,
  DocumentRepository,
  ProjectRepository,
  SettingsRepository,
  SystemService,
} from "./types";

export const tauriConversations: ConversationRepository = {
  list: () => call<Conversation[]>("conversations_list"),
  create: (input = {}) => call<Conversation>("conversations_create", { input }),
  rename: (id, title) => call<Conversation>("conversations_rename", { id, title }),
  setProject: (id, projectId) =>
    call<Conversation>("conversations_set_project", { id, projectId }),
  delete: (id) => call<void>("conversations_delete", { id }),
  deleteAll: () => call<number>("conversations_delete_all"),
  listMessages: (conversationId) => call<Message[]>("messages_list", { conversationId }),
  appendMessage: (input) => call<Message>("messages_append", { input }),
};

export const tauriProjects: ProjectRepository = {
  list: () => call<Project[]>("projects_list"),
  create: (input) => call<Project>("projects_create", { input }),
  update: (id, input) => call<Project>("projects_update", { id, input }),
  delete: (id) => call<void>("projects_delete", { id }),
};

export const tauriDocuments: DocumentRepository = {
  list: () => call<LibraryDocument[]>("documents_list"),
  importFromPicker: () => call<ImportResult>("documents_import"),
  setProject: (id, projectId) =>
    call<LibraryDocument>("documents_set_project", { id, projectId }),
  remove: (id) => call<void>("documents_remove", { id }),
  reveal: (id) => call<void>("documents_reveal", { id }),
};

export const tauriSettings: SettingsRepository = {
  load: () => call<unknown>("settings_load"),
  save: (settings) => call<void>("settings_save", { settings }),
};

export const tauriSystem: SystemService = {
  info: () => call<AppInfo>("app_info"),
  revealDataDir: () => call<void>("app_reveal_data_dir"),
  setWindowTheme: (theme) => getCurrentWindow().setTheme(theme),
};
