import { IpcError } from "@/services/ipc";
import { deriveTitle } from "@/lib/text";
import type {
  AppInfo,
  Conversation,
  ImportResult,
  LibraryDocument,
  Message,
  Project,
} from "@/types/domain";
import { PROJECT_COLORS } from "@/types/domain";
import type {
  ConversationRepository,
  DocumentRepository,
  ProjectRepository,
  SettingsRepository,
  SystemService,
} from "./types";

type StoredConversation = Omit<Conversation, "messageCount" | "preview">;
type StoredProject = Omit<Project, "conversationCount" | "documentCount">;

export interface MemoryBackendOptions {
  now?: () => number;
  id?: () => string;
  /** Documents returned by the simulated picker on each import. */
  pickDocuments?: () => Omit<LibraryDocument, "id" | "importedAt" | "projectId">[] | null;
}

export interface MemoryBackend {
  conversations: ConversationRepository;
  projects: ProjectRepository;
  documents: DocumentRepository;
  settings: SettingsRepository;
  system: SystemService;
}

const notFound = (what: string) => new IpcError("not_found", `${what} not found`);
const invalid = (message: string) => new IpcError("invalid_input", `invalid input: ${message}`);
const tick = () => Promise.resolve();

/**
 * In-memory implementation of the persistence contracts. Mirrors the SQLite
 * semantics in `src-tauri/src/db` so stores behave identically in tests and
 * in browser previews outside the desktop shell.
 */
export function createMemoryBackend(options: MemoryBackendOptions = {}): MemoryBackend {
  let counter = 0;
  const now = options.now ?? (() => Date.now());
  const id = options.id ?? (() => `mem-${++counter}-${Math.random().toString(36).slice(2, 8)}`);

  const conversations = new Map<string, StoredConversation>();
  const messages: Message[] = [];
  const projects = new Map<string, StoredProject>();
  const documents = new Map<string, LibraryDocument>();
  let settings: unknown = null;

  const hydrateConversation = (c: StoredConversation): Conversation => {
    const own = messages.filter((m) => m.conversationId === c.id);
    const last = own[own.length - 1];
    return {
      ...c,
      messageCount: own.length,
      preview: last ? last.content.slice(0, 160) : null,
    };
  };

  const hydrateProject = (p: StoredProject): Project => ({
    ...p,
    conversationCount: [...conversations.values()].filter((c) => c.projectId === p.id).length,
    documentCount: [...documents.values()].filter((d) => d.projectId === p.id).length,
  });

  const requireConversation = (cid: string) => {
    const c = conversations.get(cid);
    if (!c) throw notFound("conversation");
    return c;
  };

  const requireProjectRef = (pid: string | null | undefined) => {
    if (pid && !projects.has(pid)) throw new IpcError("database", "FOREIGN KEY constraint failed");
  };

  const conversationRepo: ConversationRepository = {
    async list() {
      await tick();
      return [...conversations.values()]
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map(hydrateConversation);
    },
    async create(input = {}) {
      await tick();
      requireProjectRef(input.projectId);
      const ts = now();
      const c: StoredConversation = {
        id: id(),
        title: (input.title ?? "").split(/\s+/).filter(Boolean).join(" "),
        projectId: input.projectId ?? null,
        createdAt: ts,
        updatedAt: ts,
      };
      conversations.set(c.id, c);
      return hydrateConversation(c);
    },
    async rename(cid, title) {
      await tick();
      const c = requireConversation(cid);
      const clean = title.split(/\s+/).filter(Boolean).join(" ");
      if (!clean) throw invalid("title cannot be empty");
      c.title = clean;
      c.updatedAt = now();
      return hydrateConversation(c);
    },
    async setProject(cid, projectId) {
      await tick();
      const c = requireConversation(cid);
      requireProjectRef(projectId);
      c.projectId = projectId;
      return hydrateConversation(c);
    },
    async delete(cid) {
      await tick();
      conversations.delete(cid);
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i]!.conversationId === cid) messages.splice(i, 1);
      }
    },
    async deleteAll() {
      await tick();
      const count = conversations.size;
      conversations.clear();
      messages.length = 0;
      return count;
    },
    async listMessages(cid) {
      await tick();
      return messages.filter((m) => m.conversationId === cid);
    },
    async appendMessage(input) {
      await tick();
      const c = requireConversation(input.conversationId);
      if (input.role === "user" && !input.content.trim()) throw invalid("message cannot be empty");
      const own = messages.filter((m) => m.conversationId === c.id);
      const last = own[own.length - 1];
      const ts = Math.max(now(), last ? last.createdAt + 1 : 0);
      const message: Message = {
        id: id(),
        conversationId: c.id,
        role: input.role,
        content: input.content,
        status: input.status ?? "complete",
        model: input.model ?? null,
        error: input.error ?? null,
        createdAt: ts,
      };
      messages.push(message);
      c.updatedAt = ts;
      if (input.role === "user" && c.title === "") c.title = deriveTitle(input.content);
      return message;
    },
  };

  const validateProject = (name: string, color: string | undefined) => {
    const clean = name.split(/\s+/).filter(Boolean).join(" ");
    if (!clean) throw invalid("project name cannot be empty");
    const c = color ?? "blue";
    if (!(PROJECT_COLORS as readonly string[]).includes(c)) throw invalid(`unknown color '${c}'`);
    return { name: clean, color: c as Project["color"] };
  };

  const projectRepo: ProjectRepository = {
    async list() {
      await tick();
      return [...projects.values()].sort((a, b) => b.updatedAt - a.updatedAt).map(hydrateProject);
    },
    async create(input) {
      await tick();
      const { name, color } = validateProject(input.name, input.color);
      const ts = now();
      const p: StoredProject = {
        id: id(),
        name,
        color,
        description: (input.description ?? "").trim(),
        createdAt: ts,
        updatedAt: ts,
      };
      projects.set(p.id, p);
      return hydrateProject(p);
    },
    async update(pid, input) {
      await tick();
      const p = projects.get(pid);
      if (!p) throw notFound("project");
      const { name, color } = validateProject(input.name, input.color);
      Object.assign(p, { name, color, description: (input.description ?? "").trim(), updatedAt: now() });
      return hydrateProject(p);
    },
    async delete(pid) {
      await tick();
      projects.delete(pid);
      for (const c of conversations.values()) if (c.projectId === pid) c.projectId = null;
      for (const d of documents.values()) if (d.projectId === pid) d.projectId = null;
    },
  };

  const documentRepo: DocumentRepository = {
    async list() {
      await tick();
      return [...documents.values()].sort((a, b) => b.importedAt - a.importedAt);
    },
    async importFromPicker() {
      await tick();
      const picked = options.pickDocuments?.() ?? null;
      const result: ImportResult = { cancelled: picked === null, imported: [], duplicates: 0, failed: [] };
      for (const file of picked ?? []) {
        if ([...documents.values()].some((d) => d.path === file.path)) {
          result.duplicates++;
          continue;
        }
        const doc: LibraryDocument = { ...file, id: id(), importedAt: now(), projectId: null };
        documents.set(doc.id, doc);
        result.imported.push(doc);
      }
      return result;
    },
    async setProject(did, projectId) {
      await tick();
      const d = documents.get(did);
      if (!d) throw notFound("document");
      requireProjectRef(projectId);
      d.projectId = projectId;
      return { ...d };
    },
    async remove(did) {
      await tick();
      documents.delete(did);
    },
    async reveal(did) {
      await tick();
      if (!documents.has(did)) throw notFound("document");
    },
  };

  const settingsRepo: SettingsRepository = {
    async load() {
      await tick();
      return settings === null ? null : structuredClone(settings);
    },
    async save(value) {
      await tick();
      settings = structuredClone(value);
    },
  };

  const info: AppInfo = { name: "AI Workspace", version: "0.1.0 (preview)", dataDir: "In-memory (browser preview)" };
  const system: SystemService = {
    info: async () => info,
    revealDataDir: async () => {},
    setWindowTheme: async () => {},
  };

  return {
    conversations: conversationRepo,
    projects: projectRepo,
    documents: documentRepo,
    settings: settingsRepo,
    system,
  };
}
