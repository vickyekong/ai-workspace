const AUTO_TITLE_CHARS = 56;

/** Mirrors `derive_title` in `src-tauri/src/db/conversations.rs`. */
export function deriveTitle(content: string): string {
  const line = content
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  const collapsed = (line ?? "").split(/\s+/).filter(Boolean).join(" ");
  const chars = Array.from(collapsed);
  if (chars.length <= AUTO_TITLE_CHARS) return collapsed;
  const truncated = chars.slice(0, AUTO_TITLE_CHARS).join("");
  const cut = truncated.lastIndexOf(" ");
  const base = cut > AUTO_TITLE_CHARS / 2 ? truncated.slice(0, cut) : truncated;
  return `${base.replace(/[\p{P}]+$/u, "")}…`;
}

export function conversationTitle(title: string): string {
  return title.trim() || "New conversation";
}

export function collapseWhitespace(text: string): string {
  return text.split(/\s+/).filter(Boolean).join(" ");
}
