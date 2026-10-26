import type { DocumentKind, LibraryDocument } from "@/types/domain";

export type KindFilter = DocumentKind | "all";

export interface DocumentQuery {
  text: string;
  kind: KindFilter;
  projectId?: string | null;
}

function normalize(value: string): string {
  return value.normalize("NFKD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/**
 * Filters documents by kind/project and ranks text matches: name matches
 * first, then extension, then excerpt. Every whitespace-separated term must match.
 */
export function searchDocuments(documents: LibraryDocument[], query: DocumentQuery): LibraryDocument[] {
  const terms = normalize(query.text).split(/\s+/).filter(Boolean);
  const scored: { doc: LibraryDocument; score: number }[] = [];

  for (const doc of documents) {
    if (query.kind !== "all" && doc.kind !== query.kind) continue;
    if (query.projectId !== undefined && doc.projectId !== query.projectId) continue;
    if (terms.length === 0) {
      scored.push({ doc, score: 0 });
      continue;
    }
    const name = normalize(doc.name);
    const ext = normalize(doc.extension);
    const excerpt = normalize(doc.excerpt ?? "");
    let score = 0;
    let matchedAll = true;
    for (const term of terms) {
      if (name.includes(term)) score += name.startsWith(term) ? 4 : 3;
      else if (ext === term) score += 2;
      else if (excerpt.includes(term)) score += 1;
      else {
        matchedAll = false;
        break;
      }
    }
    if (matchedAll) scored.push({ doc, score });
  }

  return scored
    .sort((a, b) => b.score - a.score || b.doc.importedAt - a.doc.importedAt)
    .map((s) => s.doc);
}

export function kindCounts(documents: LibraryDocument[]): Record<KindFilter, number> {
  const counts: Record<KindFilter, number> = {
    all: documents.length,
    pdf: 0,
    markdown: 0,
    text: 0,
    word: 0,
    spreadsheet: 0,
    code: 0,
    other: 0,
  };
  for (const d of documents) counts[d.kind]++;
  return counts;
}
