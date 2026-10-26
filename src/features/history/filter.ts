import { conversationTitle } from "@/lib/text";
import type { Conversation } from "@/types/domain";

export function filterConversations(conversations: Conversation[], query: string): Conversation[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return conversations;
  return conversations.filter((c) => {
    const haystack = `${conversationTitle(c.title)} ${c.preview ?? ""}`.toLowerCase();
    return terms.every((t) => haystack.includes(t));
  });
}
