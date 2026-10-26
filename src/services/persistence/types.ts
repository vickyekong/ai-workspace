import type {
  AppInfo,
  Conversation,
  ImportResult,
  LibraryDocument,
  Message,
  NewConversation,
  NewMessage,
  Project,
  ProjectInput,
} from "@/types/domain";

export interface ConversationRepository {
  list(): Promise<Conversation[]>;
  create(input?: NewConversation): Promise<Conversation>;
  rename(id: string, title: string): Promise<Conversation>;
  setProject(id: string, projectId: string | null): Promise<Conversation>;
  delete(id: string): Promise<void>;
  deleteAll(): Promise<number>;
  listMessages(conversationId: string): Promise<Message[]>;
  appendMessage(input: NewMessage): Promise<Message>;
}

export interface ProjectRepository {
  list(): Promise<Project[]>;
  create(input: ProjectInput): Promise<Project>;
  update(id: string, input: ProjectInput): Promise<Project>;
  delete(id: string): Promise<void>;
}

export interface DocumentRepository {
  list(): Promise<LibraryDocument[]>;
  /** Opens the native picker; paths never originate in the webview. */
  importFromPicker(): Promise<ImportResult>;
  setProject(id: string, projectId: string | null): Promise<LibraryDocument>;
  remove(id: string): Promise<void>;
  reveal(id: string): Promise<void>;
}

export interface SettingsRepository {
  load(): Promise<unknown>;
  save(settings: object): Promise<void>;
}

export interface SystemService {
  info(): Promise<AppInfo>;
  revealDataDir(): Promise<void>;
  setWindowTheme(theme: "light" | "dark" | null): Promise<void>;
}
