/**
 * Domain types shared across features. These mirror the serde structs in
 * `src-tauri/src/db/*` and `src-tauri/src/ai/mod.rs` — keep them in sync.
 */

export type Role = "user" | "assistant" | "system";
export type PersistedMessageStatus = "complete" | "error" | "cancelled";

export interface Conversation {
  id: string;
  /** Empty until the first user message assigns an automatic title. */
  title: string;
  projectId: string | null;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  preview: string | null;
}

export interface NewConversation {
  title?: string | null;
  projectId?: string | null;
}

export interface Message {
  id: string;
  conversationId: string;
  role: Role;
  content: string;
  status: PersistedMessageStatus;
  model: string | null;
  error: string | null;
  createdAt: number;
}

export interface NewMessage {
  conversationId: string;
  role: Role;
  content: string;
  status?: PersistedMessageStatus;
  model?: string | null;
  error?: string | null;
}

export const PROJECT_COLORS = ["blue", "violet", "pink", "orange", "green", "teal", "gray"] as const;
export type ProjectColor = (typeof PROJECT_COLORS)[number];

export interface Project {
  id: string;
  name: string;
  description: string;
  color: ProjectColor;
  createdAt: number;
  updatedAt: number;
  conversationCount: number;
  documentCount: number;
}

export interface ProjectInput {
  name: string;
  description?: string;
  color?: ProjectColor;
}

export type DocumentKind = "pdf" | "markdown" | "text" | "word" | "spreadsheet" | "code" | "other";

export interface LibraryDocument {
  id: string;
  name: string;
  path: string;
  extension: string;
  kind: DocumentKind;
  sizeBytes: number;
  modifiedAt: number | null;
  importedAt: number;
  excerpt: string | null;
  projectId: string | null;
  /** False when the original file has moved or been deleted since import. */
  available: boolean;
}

export interface ImportResult {
  cancelled: boolean;
  imported: LibraryDocument[];
  duplicates: number;
  failed: { name: string; reason: string }[];
}

export interface AppInfo {
  name: string;
  version: string;
  dataDir: string;
}

export interface AppError {
  kind: "database" | "not_found" | "invalid_input" | "io" | "provider" | "internal" | "unknown";
  message: string;
}
