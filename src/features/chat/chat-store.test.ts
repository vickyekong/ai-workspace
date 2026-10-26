import { describe, expect, it } from "vitest";
import { createMockAi } from "@/services/ai/mock";
import type { AiService } from "@/services/ai/types";
import { createMemoryBackend } from "@/services/persistence/memory";
import type { Message } from "@/types/domain";
import { createChatStore, toChatTurns } from "./chat-store";

function setup(ai: AiService = createMockAi({ tokenDelayMs: 0, reply: () => "Hello there friend" })) {
  const backend = createMemoryBackend();
  let n = 0;
  const store = createChatStore({
    conversations: backend.conversations,
    ai,
    getProviderId: () => "mock",
    newRequestId: () => `req-${++n}`,
  });
  return { backend, store };
}

describe("chat store", () => {
  it("creates a conversation lazily on first send and persists both turns", async () => {
    const { backend, store } = setup();
    expect(store.getState().activeId).toBeNull();

    const id = await store.getState().send("  Plan my week  ");

    expect(id).toBeTruthy();
    const state = store.getState();
    expect(state.activeId).toBe(id);
    expect(state.stream).toBeNull();
    expect(state.messages[id!]?.map((m) => [m.role, m.content])).toEqual([
      ["user", "Plan my week"],
      ["assistant", "Hello there friend"],
    ]);
    const persisted = await backend.conversations.listMessages(id!);
    expect(persisted).toHaveLength(2);
    expect(state.conversations[0]?.title).toBe("Plan my week");
    expect(state.conversations[0]?.messageCount).toBe(2);
  });

  it("assigns a draft project to the created conversation", async () => {
    const { backend, store } = setup();
    const project = await backend.projects.create({ name: "Launch" });
    await store.getState().open(null, project.id);
    const id = await store.getState().send("hi");
    const [conversation] = await backend.conversations.list();
    expect(conversation?.id).toBe(id);
    expect(conversation?.projectId).toBe(project.id);
  });

  it("ignores empty input and concurrent sends", async () => {
    const { store } = setup(createMockAi({ tokenDelayMs: 5 }));
    expect(await store.getState().send("   ")).toBeNull();
    const first = store.getState().send("one");
    await new Promise((r) => setTimeout(r, 10));
    expect(store.getState().stream).not.toBeNull();
    const second = await store.getState().send("two");
    await first;
    const id = store.getState().activeId!;
    expect(second).toBe(id);
    expect(store.getState().messages[id]?.filter((m) => m.role === "user")).toHaveLength(1);
  });

  it("persists partial replies as cancelled when stopped", async () => {
    const { store } = setup(createMockAi({ tokenDelayMs: 5 }));
    const sending = store.getState().send("Tell me a long story");
    await new Promise((r) => setTimeout(r, 25));
    await store.getState().stop();
    const id = await sending;
    const last = store.getState().messages[id!]?.at(-1);
    expect(last?.role).toBe("assistant");
    expect(last?.status).toBe("cancelled");
    expect(store.getState().stream).toBeNull();
  });

  it("surfaces provider errors and recovers on retry", async () => {
    let fail = true;
    const ai: AiService = {
      listProviders: async () => [],
      streamChat(_request, onEvent) {
        const done = (async () => {
          await Promise.resolve();
          onEvent({ type: "started", providerId: "mock", model: "m" });
          if (fail) {
            onEvent({ type: "error", message: "boom" });
            return;
          }
          onEvent({ type: "delta", text: "recovered" });
          onEvent({ type: "completed", finishReason: "stop" });
        })();
        return { done, cancel: async () => {} };
      },
    };
    const { store } = setup(ai);
    const id = await store.getState().send("question");
    expect(store.getState().error).toEqual({ conversationId: id, message: "boom" });
    // No partial content, so nothing extra is persisted.
    expect(store.getState().messages[id!]).toHaveLength(1);

    fail = false;
    await store.getState().retry();
    expect(store.getState().error).toBeNull();
    expect(store.getState().messages[id!]?.at(-1)?.content).toBe("recovered");
  });

  it("only replays completed turns as model context", async () => {
    const sent: unknown[] = [];
    const ai: AiService = {
      listProviders: async () => [],
      streamChat(request, onEvent) {
        sent.push(request.messages);
        const done = (async () => {
          onEvent({ type: "completed", finishReason: "stop" });
        })();
        return { done, cancel: async () => {} };
      },
    };
    const { store } = setup(ai);
    await store.getState().send("first");
    expect(sent[0]).toEqual([{ role: "user", content: "first" }]);
  });

  it("announces a new conversation before its reply streams", async () => {
    const backend = createMemoryBackend();
    const events: string[] = [];
    const store = createChatStore({
      conversations: backend.conversations,
      ai: {
        listProviders: async () => [],
        streamChat(_request, onEvent) {
          events.push("stream");
          const done = (async () => onEvent({ type: "completed", finishReason: "stop" }))();
          return { done, cancel: async () => {} };
        },
      },
      onConversationCreated: (id) => events.push(`created:${id}`),
    });
    const id = await store.getState().send("hello");
    expect(events).toEqual([`created:${id}`, "stream"]);
  });

  it("keeps an error when reopening the same conversation but clears it when switching", async () => {
    const ai: AiService = {
      listProviders: async () => [],
      streamChat(_request, onEvent) {
        const done = (async () => onEvent({ type: "error", message: "boom" }))();
        return { done, cancel: async () => {} };
      },
    };
    const { store } = setup(ai);
    const id = await store.getState().send("question");
    await store.getState().open(id);
    expect(store.getState().error?.message).toBe("boom");
    await store.getState().open(null);
    expect(store.getState().error).toBeNull();
  });

  it("removes conversations and clears the active selection", async () => {
    const { backend, store } = setup();
    const id = await store.getState().send("hello");
    await store.getState().remove(id!);
    expect(store.getState().activeId).toBeNull();
    expect(store.getState().conversations).toHaveLength(0);
    expect(await backend.conversations.list()).toHaveLength(0);
  });

  it("loads messages when opening an existing conversation", async () => {
    const { backend, store } = setup();
    const c = await backend.conversations.create();
    await backend.conversations.appendMessage({ conversationId: c.id, role: "user", content: "saved" });
    await store.getState().loadConversations();
    await store.getState().open(c.id);
    expect(store.getState().messages[c.id]?.[0]?.content).toBe("saved");
    expect(store.getState().loadingMessages).toBe(false);
  });
});

describe("toChatTurns", () => {
  it("drops failed, cancelled, and blank messages", () => {
    const base = { conversationId: "c", model: null, error: null, createdAt: 0 };
    const messages: Message[] = [
      { ...base, id: "1", role: "user", content: "q", status: "complete" },
      { ...base, id: "2", role: "assistant", content: "partial", status: "cancelled" },
      { ...base, id: "3", role: "assistant", content: "bad", status: "error" },
      { ...base, id: "4", role: "assistant", content: "  ", status: "complete" },
      { ...base, id: "5", role: "assistant", content: "a", status: "complete" },
    ];
    expect(toChatTurns(messages)).toEqual([
      { role: "user", content: "q" },
      { role: "assistant", content: "a" },
    ]);
  });
});

describe("chat operation races", () => {
  it("claims a send before the first persistence await", async () => {
    const { backend, store } = setup();
    const first = store.getState().send("one");
    expect(store.getState().busy).toBe(true);
    await store.getState().send("two");
    const id = await first;
    expect(await backend.conversations.list()).toHaveLength(1);
    expect((await backend.conversations.listMessages(id!)).filter((m) => m.role === "user"))
      .toHaveLength(1);
    expect(store.getState().busy).toBe(false);
  });

  it("clearing during draft creation waits for persistence and prevents a late reply", async () => {
    const { backend, store } = setup();
    const sending = store.getState().send("one");
    const clearing = store.getState().removeAll();
    await Promise.all([sending, clearing]);
    expect(await backend.conversations.list()).toEqual([]);
    expect(store.getState().messages).toEqual({});
    expect(store.getState().stream).toBeNull();
    expect(store.getState().error).toBeNull();
  });

  it("deletion waits for cancelled reply persistence", async () => {
    let finish!: () => void;
    let started!: () => void;
    const ready = new Promise<void>((resolve) => { started = resolve; });
    const ai: AiService = {
      listProviders: async () => [],
      streamChat(_request, emit) {
        const done = new Promise<void>((resolve) => { finish = resolve; });
        emit({ type: "delta", text: "partial" });
        started();
        return { done, cancel: async () => {
          emit({ type: "completed", finishReason: "cancelled" });
          finish();
        } };
      },
    };
    const { backend, store } = setup(ai);
    const sending = store.getState().send("one");
    await ready;
    const id = store.getState().activeId!;
    await store.getState().remove(id);
    await sending;
    expect(await backend.conversations.listMessages(id)).toEqual([]);
    expect(store.getState().messages[id]).toBeUndefined();
    expect(store.getState().error).toBeNull();
  });

  it.each(["throw", "reject", "missing terminal"])("recovers from provider %s", async (failure) => {
    const ai: AiService = {
      listProviders: async () => [],
      streamChat() {
        if (failure === "throw") throw new Error("start failed");
        return { done: failure === "reject" ? Promise.reject(new Error("stream failed")) : Promise.resolve(),
          cancel: async () => {} };
      },
    };
    const { store } = setup(ai);
    await store.getState().send("question");
    expect(store.getState().error).not.toBeNull();
    expect(store.getState().busy).toBe(false);
    expect(store.getState().stream).toBeNull();
  });

  it("waits for history before sending into an opening conversation", async () => {
    const { backend, store } = setup();
    const c = await backend.conversations.create();
    await backend.conversations.appendMessage({ conversationId: c.id, role: "user", content: "old" });
    const opening = store.getState().open(c.id);
    const sending = store.getState().send("new");
    await Promise.all([opening, sending]);
    expect(store.getState().messages[c.id]?.map((m) => m.content)).toEqual(["old", "new", "Hello there friend"]);
  });
});
