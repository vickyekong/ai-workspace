import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Clock, MoreHorizontal, PenLine, SearchX, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { EmptyState, IconButton, ProjectDot, SearchField, Toolbar } from "@/components/common/primitives";
import { chatStore, navigationStore, useChat, useProjects } from "@/app/stores";
import { startNewChat } from "@/app/use-shortcuts";
import { formatRelative, groupByDate } from "@/lib/format";
import { conversationTitle } from "@/lib/text";
import type { Conversation } from "@/types/domain";
import { ConfirmDialog, RenameDialog } from "@/features/chat/conversation-dialogs";
import { filterConversations } from "./filter";
import { plural } from "@/lib/plural";

export function HistoryPage() {
  const conversations = useChat((s) => s.conversations);
  const loaded = useChat((s) => s.conversationsLoaded);
  const projects = useProjects((s) => s.projects);
  const [query, setQuery] = useState("");
  const [renaming, setRenaming] = useState<Conversation | null>(null);
  const [deleting, setDeleting] = useState<Conversation | null>(null);

  const groups = useMemo(
    () => groupByDate(filterConversations(conversations, query), (c) => c.updatedAt),
    [conversations, query],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Toolbar title="History" subtitle={plural(conversations.length, "conversation")}>
        <SearchField value={query} onChange={setQuery} placeholder="Search history" className="w-56" />
      </Toolbar>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
        {!loaded ? null : conversations.length === 0 ? (
          <EmptyState
            icon={Clock}
            title="No saved sessions"
            description="Every conversation is saved here automatically so you can pick up where you left off."
            className="h-full"
          >
            <Button onClick={() => startNewChat()}>Start a Conversation</Button>
          </EmptyState>
        ) : groups.length === 0 ? (
          <EmptyState
            icon={SearchX}
            title="No matches"
            description={`Nothing in your history matches “${query}”.`}
            className="h-full"
          />
        ) : (
          <div className="mx-auto max-w-[820px] px-6 py-5">
            {groups.map((group) => (
              <section key={group.bucket} className="mb-6">
                <h2 className="sticky top-0 z-10 -mx-2 bg-background/90 px-2 py-1.5 text-[11px] font-semibold text-muted-foreground backdrop-blur">
                  {group.bucket}
                </h2>
                <div className="mt-1 space-y-px">
                  <AnimatePresence initial={false}>
                    {group.items.map((c) => {
                      const project = projects.find((p) => p.id === c.projectId);
                      return (
                        <motion.div
                          key={c.id}
                          layout
                          exit={{ opacity: 0, height: 0 }}
                          className="group flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-muted/60"
                        >
                          <button
                            className="min-w-0 flex-1 text-left"
                            onClick={() => navigationStore.getState().navigate({ page: "chat", conversationId: c.id })}
                          >
                            <div className="flex items-center gap-2">
                              <span className="truncate text-[13px] font-medium">{conversationTitle(c.title)}</span>
                              {project && (
                                <span className="flex shrink-0 items-center gap-1 rounded-full bg-muted px-1.5 py-px text-[10.5px] text-muted-foreground">
                                  <ProjectDot color={project.color} className="size-1.5" />
                                  {project.name}
                                </span>
                              )}
                            </div>
                            <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
                              {c.preview ?? "No messages yet"}
                            </p>
                          </button>
                          <div className="flex shrink-0 flex-col items-end text-[11px] text-muted-foreground tabular-nums">
                            <span>{formatRelative(c.updatedAt)}</span>
                            <span>{plural(c.messageCount, "message")}</span>
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <IconButton label="Actions" className="opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100">
                                <MoreHorizontal />
                              </IconButton>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              <DropdownMenuItem onSelect={() => setRenaming(c)}>
                                <PenLine /> Rename…
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(c)}>
                                <Trash2 /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      <RenameDialog
        open={renaming !== null}
        onOpenChange={(open) => !open && setRenaming(null)}
        initial={renaming ? conversationTitle(renaming.title) : ""}
        onSubmit={(title) => renaming && void chatStore.getState().rename(renaming.id, title)}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete this conversation?"
        description={`“${deleting ? conversationTitle(deleting.title) : ""}” and its messages will be permanently removed.`}
        onConfirm={() => deleting && void chatStore.getState().remove(deleting.id)}
      />
    </div>
  );
}
