import { describe, expect, it } from "vitest";
import { createMemoryBackend } from "./memory";

function clock(start = 1_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

describe("memory persistence backend", () => {
  it("orders conversations by recent activity and auto-titles once", async () => {
    const c = clock();
    const { conversations } = createMemoryBackend({ now: c.now });
    const a = await conversations.create();
    c.advance(10);
    const b = await conversations.create();
    c.advance(10);
    await conversations.appendMessage({ conversationId: a.id, role: "user", content: "First topic" });
    await conversations.appendMessage({ conversationId: a.id, role: "user", content: "Second" });

    const list = await conversations.list();
    expect(list.map((x) => x.id)).toEqual([a.id, b.id]);
    expect(list[0]).toMatchObject({ title: "First topic", messageCount: 2, preview: "Second" });
  });

  it("keeps message timestamps strictly increasing within a millisecond", async () => {
    const { conversations } = createMemoryBackend({ now: () => 5 });
    const c = await conversations.create();
    const m1 = await conversations.appendMessage({ conversationId: c.id, role: "user", content: "a" });
    const m2 = await conversations.appendMessage({ conversationId: c.id, role: "assistant", content: "b" });
    expect(m2.createdAt).toBeGreaterThan(m1.createdAt);
  });

  it("rejects empty user messages and unknown conversations", async () => {
    const { conversations } = createMemoryBackend();
    const c = await conversations.create();
    await expect(
      conversations.appendMessage({ conversationId: c.id, role: "user", content: "  " }),
    ).rejects.toMatchObject({ kind: "invalid_input" });
    await expect(
      conversations.appendMessage({ conversationId: "nope", role: "user", content: "x" }),
    ).rejects.toMatchObject({ kind: "not_found" });
  });

  it("unassigns conversations and documents when a project is deleted", async () => {
    const backend = createMemoryBackend({
      pickDocuments: () => [
        {
          name: "a.md",
          path: "/a.md",
          extension: "md",
          kind: "markdown",
          sizeBytes: 1,
          modifiedAt: null,
          excerpt: null,
          available: true,
        },
      ],
    });
    const project = await backend.projects.create({ name: "P" });
    const conversation = await backend.conversations.create({ projectId: project.id });
    const { imported } = await backend.documents.importFromPicker();
    await backend.documents.setProject(imported[0]!.id, project.id);

    expect((await backend.projects.list())[0]).toMatchObject({ conversationCount: 1, documentCount: 1 });

    await backend.projects.delete(project.id);
    expect((await backend.conversations.list())[0]?.id).toBe(conversation.id);
    expect((await backend.conversations.list())[0]?.projectId).toBeNull();
    expect((await backend.documents.list())[0]?.projectId).toBeNull();
  });

  it("dedupes imported documents by path", async () => {
    const file = {
      name: "a.pdf",
      path: "/a.pdf",
      extension: "pdf",
      kind: "pdf" as const,
      sizeBytes: 10,
      modifiedAt: null,
      excerpt: null,
      available: true,
    };
    const { documents } = createMemoryBackend({ pickDocuments: () => [file] });
    expect((await documents.importFromPicker()).imported).toHaveLength(1);
    const second = await documents.importFromPicker();
    expect(second).toMatchObject({ cancelled: false, duplicates: 1, imported: [] });
  });

  it("reports cancellation when the picker returns nothing", async () => {
    const { documents } = createMemoryBackend();
    expect((await documents.importFromPicker()).cancelled).toBe(true);
  });

  it("validates project input", async () => {
    const { projects } = createMemoryBackend();
    await expect(projects.create({ name: "   " })).rejects.toMatchObject({ kind: "invalid_input" });
    await expect(projects.create({ name: "x", color: "neon" as never })).rejects.toMatchObject({
      kind: "invalid_input",
    });
  });
});
