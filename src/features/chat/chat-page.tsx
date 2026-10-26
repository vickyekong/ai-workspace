import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence } from "motion/react";
import { Folder, Lightbulb, ListChecks, MoreHorizontal, PenLine, RotateCcw, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ErrorBanner, IconButton, ProjectDot, Spinner, Toolbar } from "@/components/common/primitives";
import { chatStore, navigationStore, useChat, useProjects, useSettings } from "@/app/stores";
import { conversationTitle } from "@/lib/text";
import { ProjectPicker } from "@/features/projects/project-picker";
import { Composer, type ComposerHandle } from "./composer";
import { ConfirmDialog, RenameDialog } from "./conversation-dialogs";
import { MessageItem } from "./message-item";
import { plural } from "@/lib/plural";

const SUGGESTIONS = [
  { icon: ListChecks, label: "Plan my week", prompt: "Help me plan my week with three priorities and daily focus blocks." },
  { icon: Lightbulb, label: "Brainstorm ideas", prompt: "Brainstorm ten names for a calm, privacy-first notes app." },
  { icon: PenLine, label: "Draft an email", prompt: "Draft a friendly email asking a client for feedback on the latest proposal." },
];

export function ChatPage({ conversationId, projectId }: { conversationId: string | null; projectId: string | null }) {
  const conversation = useChat((s) => s.conversations.find((c) => c.id === conversationId) ?? null);
  const messages = useChat((s) => (conversationId ? s.messages[conversationId] : undefined));
  const loadingMessages = useChat((s) => s.loadingMessages);
  const stream = useChat((s) => s.stream);
  const busy = useChat((s) => s.busy);
  const error = useChat((s) => s.error);
  const sendOnEnter = useSettings((s) => s.settings.sendOnEnter);
  const projects = useProjects((s) => s.projects);
  const composer = useRef<ComposerHandle>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    void chatStore.getState().open(conversationId, projectId);
    pinned.current = true;
    composer.current?.focus();
  }, [conversationId, projectId]);

  const streamingHere = stream?.conversationId === conversationId && conversationId !== null;
  const assignedProjectId = conversation?.projectId ?? (conversationId ? null : projectId);
  const project = projects.find((p) => p.id === assignedProjectId) ?? null;
  const visibleError = error && (error.conversationId === conversationId || error.conversationId === null) ? error : null;
  const isEmpty = !conversationId || (messages !== undefined && messages.length === 0 && !streamingHere);

  // Stay pinned to the bottom while streaming unless the user scrolls up.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [messages, stream?.content]);

  const send = (text: string) => {
    pinned.current = true;
    void chatStore.getState().send(text);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Toolbar
        title={conversation ? conversationTitle(conversation.title) : "New Chat"}
        subtitle={
          project ? (
            <span className="flex items-center gap-1.5">
              <ProjectDot color={project.color} className="size-1.5" />
              {project.name}
            </span>
          ) : conversation ? (
            plural(conversation.messageCount, "message")
          ) : (
            "Local Preview model"
          )
        }
      >
        {conversation && (
          <>
            <ProjectPicker
              value={conversation.projectId}
              onChange={(pid) => void chatStore.getState().setProject(conversation.id, pid)}
            >
              <IconButton label="Move to Project">
                <Folder />
              </IconButton>
            </ProjectPicker>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <IconButton label="More">
                  <MoreHorizontal />
                </IconButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onSelect={() => setRenaming(true)}>
                  <PenLine /> Rename…
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(true)}>
                  <Trash2 /> Delete Conversation
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
      </Toolbar>

      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
        }}
        className="scrollbar-thin min-h-0 flex-1 overflow-y-auto"
      >
        {loadingMessages && !messages ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <Spinner />
          </div>
        ) : isEmpty ? (
          <EmptyChat onPick={(prompt) => composer.current?.setValue(prompt)} />
        ) : (
          <div className="mx-auto flex max-w-[720px] flex-col gap-6 px-6 pt-6 pb-10">
            {messages?.map((m) => (
              <MessageItem
                key={m.id}
                role={m.role}
                content={m.content}
                status={m.status}
                createdAt={m.createdAt}
                error={m.error}
              />
            ))}
            {streamingHere && <MessageItem role="assistant" content={stream.content} status="streaming" />}
          </div>
        )}
      </div>

      <div className="mx-auto w-full max-w-[760px] shrink-0 px-5 pb-5">
        <AnimatePresence>
          {visibleError && (
            <ErrorBanner
              className="mb-2"
              message={visibleError.message}
              onDismiss={() => chatStore.getState().dismissError()}
              action={
                conversationId && !stream ? (
                  <Button size="xs" variant="outline" onClick={() => void chatStore.getState().retry()}>
                    <RotateCcw /> Retry
                  </Button>
                ) : null
              }
            />
          )}
        </AnimatePresence>
        <Composer
          ref={composer}
          autoFocus
          onSend={send}
          onStop={() => void chatStore.getState().stop()}
          streaming={busy}
          sendOnEnter={sendOnEnter}
          modelLabel="Local Preview"
          placeholder={stream && !streamingHere ? "Another conversation is responding…" : undefined}
        />
      </div>

      {conversation && (
        <>
          <RenameDialog
            open={renaming}
            onOpenChange={setRenaming}
            initial={conversationTitle(conversation.title)}
            onSubmit={(title) => void chatStore.getState().rename(conversation.id, title)}
          />
          <ConfirmDialog
            open={deleting}
            onOpenChange={setDeleting}
            title="Delete this conversation?"
            description="Its messages will be permanently removed from this Mac."
            onConfirm={() => {
              void chatStore.getState().remove(conversation.id);
              navigationStore.getState().replace({ page: "chat", conversationId: null });
            }}
          />
        </>
      )}
    </div>
  );
}

function EmptyChat({ onPick }: { onPick: (prompt: string) => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 pb-8">
      <div className="mb-5 flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-brand to-[oklch(0.62_0.19_calc(var(--brand-h)_+_50))] text-brand-foreground shadow-lg shadow-brand/25">
        <Sparkles className="size-5" />
      </div>
      <h2 className="font-heading text-[20px] font-semibold tracking-[-0.02em]">How can I help?</h2>
      <p className="mt-1.5 max-w-sm text-center text-[12.5px] text-muted-foreground">
        Conversations are saved privately on this Mac. Replies come from the built-in Local Preview model.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {SUGGESTIONS.map(({ icon: Icon, label, prompt }) => (
          <button
            key={label}
            onClick={() => onPick(prompt)}
            className="flex items-center gap-2 rounded-full border border-border bg-surface-raised px-3 py-1.5 text-[12px] text-foreground/85 shadow-[var(--shadow-window)] transition-all hover:-translate-y-px hover:text-foreground hover:shadow-[var(--shadow-float)]"
          >
            <Icon className="size-3.5 text-brand" />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
