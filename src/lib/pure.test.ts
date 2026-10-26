import { describe, expect, it } from "vitest";
import { createNavigationStore } from "@/app/navigation";
import { kindCounts, searchDocuments } from "@/features/library/search";
import type { LibraryDocument } from "@/types/domain";
import { dateBucket, formatBytes, groupByDate } from "./format";
import { conversationTitle, deriveTitle } from "./text";

describe("deriveTitle", () => {
  it("uses the first non-empty line, collapsed", () => {
    expect(deriveTitle("\n   Plan   the launch \nmore")).toBe("Plan the launch");
  });

  it("truncates long titles on a word boundary", () => {
    const title = deriveTitle(
      "Please help me design a comprehensive onboarding flow for new enterprise customers",
    );
    expect(title.endsWith("…")).toBe(true);
    expect(Array.from(title).length).toBeLessThanOrEqual(57);
    expect(title).not.toMatch(/\s…$/);
  });

  it("falls back to a placeholder for untitled conversations", () => {
    expect(conversationTitle("  ")).toBe("New conversation");
  });
});

describe("format helpers", () => {
  it("formats byte sizes", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(50 * 1024 * 1024)).toBe("50 MB");
  });

  it("groups items into ordered date buckets", () => {
    const now = new Date(2026, 9, 25, 15).getTime();
    const day = 86_400_000;
    const items = [now - 40 * day, now - 1000, now - day, now - 3 * day];
    expect(dateBucket(now - day, now)).toBe("Yesterday");
    expect(groupByDate(items, (t) => t, now).map((g) => g.bucket)).toEqual([
      "Today",
      "Yesterday",
      "Previous 7 Days",
      "Older",
    ]);
  });
});

describe("navigation store", () => {
  it("supports back/forward and ignores duplicate navigation", () => {
    const nav = createNavigationStore();
    nav.getState().navigate({ page: "library" });
    nav.getState().navigate({ page: "library" });
    nav.getState().navigate({ page: "settings" });
    expect(nav.getState().past).toHaveLength(2);

    nav.getState().back();
    expect(nav.getState().route).toEqual({ page: "library" });
    nav.getState().forward();
    expect(nav.getState().route).toEqual({ page: "settings" });

    nav.getState().back();
    nav.getState().navigate({ page: "history" });
    expect(nav.getState().future).toHaveLength(0);
  });
});

describe("searchDocuments", () => {
  const doc = (over: Partial<LibraryDocument>): LibraryDocument => ({
    id: over.name ?? "id",
    name: "file.txt",
    path: "/file.txt",
    extension: "txt",
    kind: "text",
    sizeBytes: 1,
    modifiedAt: null,
    importedAt: 0,
    excerpt: null,
    projectId: null,
    available: true,
    ...over,
  });
  const docs = [
    doc({ name: "Roadmap.pdf", extension: "pdf", kind: "pdf", importedAt: 1 }),
    doc({ name: "notes.md", extension: "md", kind: "markdown", excerpt: "Quarterly roadmap review", importedAt: 2 }),
    doc({ name: "Résumé.docx", extension: "docx", kind: "word", importedAt: 3, projectId: "p1" }),
  ];

  it("ranks name matches above excerpt matches", () => {
    expect(searchDocuments(docs, { text: "roadmap", kind: "all" }).map((d) => d.name)).toEqual([
      "Roadmap.pdf",
      "notes.md",
    ]);
  });

  it("requires all terms, ignores diacritics, and filters by kind and project", () => {
    expect(searchDocuments(docs, { text: "resume", kind: "all" })).toHaveLength(1);
    expect(searchDocuments(docs, { text: "roadmap missing", kind: "all" })).toHaveLength(0);
    expect(searchDocuments(docs, { text: "", kind: "pdf" })).toHaveLength(1);
    expect(searchDocuments(docs, { text: "", kind: "all", projectId: "p1" })).toHaveLength(1);
  });

  it("counts documents by kind", () => {
    expect(kindCounts(docs)).toMatchObject({ all: 3, pdf: 1, markdown: 1, word: 1, text: 0 });
  });
});
