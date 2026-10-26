import { createStore } from "zustand/vanilla";
import type { AiService, ChatTurn, FinishReason, StreamHandle } from "@/services/ai/types";
import { toAppError } from "@/services/ipc";
import type { ConversationRepository } from "@/services/persistence/types";
import type { Conversation, Message } from "@/types/domain";

export interface ActiveStream {
  conversationId: string;
  requestId: string;
  content: string;
  model: string | null;
}

export interface ChatError {
  conversationId: string | null;
  message: string;
}

export interface ChatState {
  conversations: Conversation[];
  conversationsLoaded: boolean;
  /** `null` is an unsaved draft; it becomes a conversation on first send. */
  activeId: string | null;
  draftProjectId: string | null;
  messages: Record<string, Message[]>;
  loadingMessages: boolean;
  stream: ActiveStream | null;
  busy: boolean;
  error: ChatError | null;

  loadConversations(): Promise<void>;
  open(conversationId: string | null, draftProjectId?: string | null): Promise<void>;
  /** Sends a user message and streams the reply. Resolves with the conversation id. */
  send(content: string): Promise<string | null>;
  retry(): Promise<void>;
  stop(): Promise<void>;
  rename(id: string, title: string): Promise<void>;
  setProject(id: string, projectId: string | null): Promise<void>;
  remove(id: string): Promise<void>;
  removeAll(): Promise<number>;
  dismissError(): void;
}

export interface ChatStoreDeps {
  conversations: ConversationRepository;
  ai: AiService;
  getProviderId?: () => string | null;
  newRequestId?: () => string;
  /** Called when a draft becomes a saved conversation, before the reply streams. */
  onConversationCreated?: (conversationId: string) => void;
}

/** Only completed turns are replayed as model context. */
export function toChatTurns(messages: Message[]): ChatTurn[] {
  return messages
    .filter((m) => m.status === "complete" && m.content.trim().length > 0)
    .map(({ role, content }) => ({ role, content }));
}

export function createChatStore(deps: ChatStoreDeps) {
  const newRequestId = deps.newRequestId ?? (() => crypto.randomUUID());
  let handle: StreamHandle | null = null;
  let operation: Promise<unknown> | null = null;
  let stopRequested = false;
  let deleting = 0;
  let loadEpoch = 0;
  const loads = new Map<string, Promise<void>>();

  return createStore<ChatState>()((set, get) => {
    const fail = (conversationId: string | null, error: unknown) =>
      set({ error: { conversationId, message: toAppError(error).message } });

    const refreshConversations = async () => {
      set({ conversations: await deps.conversations.list(), conversationsLoaded: true });
    };

    const pushMessage = (message: Message) =>
      set((s) => ({
        messages: {
          ...s.messages,
          [message.conversationId]: [...(s.messages[message.conversationId] ?? []), message],
        },
      }));

    const loadMessages = (id: string): Promise<void> => {
      if (get().messages[id]) return Promise.resolve();
      const pending = loads.get(id);
      if (pending) return pending;
      const epoch = loadEpoch;
      const load = deps.conversations.listMessages(id).then((messages) => {
        if (epoch === loadEpoch) set((s) => ({ messages: { ...s.messages, [id]: messages } }));
      }).finally(() => { loads.delete(id); });
      loads.set(id, load);
      return load;
    };

    // Claim the operation synchronously, before any persistence or provider await.
    const run = <T>(work: () => Promise<T>): Promise<T> => {
      stopRequested = false;
      set({ busy: true });
      const pending = Promise.resolve().then(work).finally(() => {
        handle = null;
        operation = null;
        set({ busy: false, stream: null });
      });
      operation = pending;
      return pending;
    };

    /** Streams an assistant reply for the conversation's current history. */
    const streamReply = async (conversationId: string) => {
      const requestId = newRequestId();
      const history = toChatTurns(get().messages[conversationId] ?? []);
      set({ stream: { conversationId, requestId, content: "", model: null }, error: null });

      const outcome: { finish: FinishReason | null; error: string | null } = {
        finish: null,
        error: null,
      };

      try {
        handle = deps.ai.streamChat(
          { requestId, providerId: deps.getProviderId?.() ?? null, messages: history },
          (event) => {
            const current = get().stream;
            if (!current || current.requestId !== requestId) return;
            switch (event.type) {
              case "started":
                set({ stream: { ...current, model: event.model } });
                break;
              case "delta":
                set({ stream: { ...current, content: current.content + event.text } });
                break;
              case "completed":
                outcome.finish = event.finishReason;
                break;
              case "error":
                outcome.error = event.message;
                break;
            }
          },
        );
        if (stopRequested) await handle.cancel();
        await handle.done;
        if (outcome.finish === null && outcome.error === null) {
          outcome.error = "The provider ended without a completion event.";
        }
      } catch (error) {
        outcome.error = toAppError(error).message;
      }
      handle = null;

      const final = get().stream;
      const content = final?.requestId === requestId ? final.content : "";
      const model = final?.model ?? null;
      try {
        if (outcome.error !== null) {
          if (content.trim()) {
            pushMessage(
              await deps.conversations.appendMessage({
                conversationId,
                role: "assistant",
                content,
                status: "error",
                model,
                error: outcome.error,
              }),
            );
          }
          set({ error: { conversationId, message: outcome.error } });
        } else if (content.trim()) {
          pushMessage(
            await deps.conversations.appendMessage({
              conversationId,
              role: "assistant",
              content,
              status: outcome.finish === "cancelled" ? "cancelled" : "complete",
              model,
            }),
          );
        }
      } catch (error) {
        fail(conversationId, error);
      } finally {
        set({ stream: null });
      }
      await refreshConversations().catch(() => {});
    };

    return {
      conversations: [],
      conversationsLoaded: false,
      activeId: null,
      draftProjectId: null,
      messages: {},
      loadingMessages: false,
      stream: null,
      busy: false,
      error: null,

      async loadConversations() {
        try {
          await refreshConversations();
        } catch (error) {
          set({ conversationsLoaded: true });
          fail(null, error);
        }
      },

      async open(conversationId, draftProjectId = null) {
        const switching = get().activeId !== conversationId;
        set({ activeId: conversationId, draftProjectId, loadingMessages: false, ...(switching ? { error: null } : {}) });
        if (!conversationId || get().messages[conversationId]) return;
        set({ loadingMessages: true });
        try {
          await loadMessages(conversationId);
        } catch (error) {
          fail(conversationId, error);
        } finally {
          if (get().activeId === conversationId) set({ loadingMessages: false });
        }
      },

      async send(raw) {
        const content = raw.trim();
        if (!content || get().busy || deleting) return get().activeId;

        let conversationId = get().activeId;
        const projectId = get().draftProjectId;
        return run(async () => {
          try {
            if (!conversationId) {
              const created = await deps.conversations.create({ projectId });
              conversationId = created.id;
              set((s) => ({
                activeId: created.id,
                draftProjectId: null,
                conversations: [created, ...s.conversations],
                messages: { ...s.messages, [created.id]: [] },
              }));
              deps.onConversationCreated?.(created.id);
            }
            await loadMessages(conversationId);
            pushMessage(
              await deps.conversations.appendMessage({ conversationId, role: "user", content }),
            );
            await refreshConversations();
          } catch (error) {
            fail(conversationId, error);
            return conversationId;
          }

          if (!stopRequested) await streamReply(conversationId);
          return conversationId;
        });
      },

      async retry() {
        const { activeId, busy } = get();
        if (!activeId || busy || deleting) return;
        await run(async () => {
          try {
            await loadMessages(activeId);
            if (!stopRequested) await streamReply(activeId);
          } catch (error) { fail(activeId, error); }
        });
      },

      async stop() {
        stopRequested = true;
        try { await handle?.cancel(); } catch (error) { fail(get().activeId, error); }
        await operation;
      },

      async rename(id, title) {
        try {
          const updated = await deps.conversations.rename(id, title);
          set((s) => ({ conversations: s.conversations.map((c) => (c.id === id ? updated : c)) }));
        } catch (error) {
          fail(id, error);
        }
      },

      async setProject(id, projectId) {
        try {
          const updated = await deps.conversations.setProject(id, projectId);
          set((s) => ({ conversations: s.conversations.map((c) => (c.id === id ? updated : c)) }));
        } catch (error) {
          fail(id, error);
        }
      },

      async remove(id) {
        deleting++;
        try {
          await get().stop();
          loadEpoch++;
          await Promise.allSettled(loads.values());
          await deps.conversations.delete(id);
          set((s) => {
            const { [id]: _removed, ...messages } = s.messages;
            return {
              conversations: s.conversations.filter((c) => c.id !== id),
              messages,
              activeId: s.activeId === id ? null : s.activeId,
            };
          });
        } catch (error) {
          fail(id, error);
        } finally { deleting--; }
      },

      async removeAll() {
        deleting++;
        try {
          await get().stop();
          loadEpoch++;
          await Promise.allSettled(loads.values());
          const count = await deps.conversations.deleteAll();
          set({ conversations: [], messages: {}, activeId: null });
          return count;
        } catch (error) {
          fail(null, error);
          return 0;
        } finally { deleting--; }
      },

      dismissError() {
        set({ error: null });
      },
    };
  });
}

export type ChatStore = ReturnType<typeof createChatStore>;
