import { ArrowRight, Clock, FileUp, FolderPlus, MessageSquarePlus, MessagesSquare } from "lucide-react";
import { motion } from "motion/react";
import { Composer } from "@/features/chat/composer";
import { EmptyState, ProjectDot, Shortcut, Toolbar } from "@/components/common/primitives";
import {
  chatStore,
  libraryStore,
  navigationStore,
  useChat,
  useLibrary,
  useProjects,
  useSettings,
} from "@/app/stores";
import { startNewChat } from "@/app/use-shortcuts";
import { formatRelative, greeting } from "@/lib/format";
import { conversationTitle } from "@/lib/text";
import { importDocuments } from "@/features/library/import";
import { plural } from "@/lib/plural";

const EASE = [0.32, 0.72, 0, 1] as const;

export function HomePage() {
  const conversations = useChat((s) => s.conversations);
  const loaded = useChat((s) => s.conversationsLoaded);
  const busy = useChat((s) => s.busy);
  const documentCount = useLibrary((s) => s.documents.length);
  const projects = useProjects((s) => s.projects);
  const sendOnEnter = useSettings((s) => s.settings.sendOnEnter);
  const navigate = navigationStore.getState().navigate;
  const recent = conversations.slice(0, 6);

  const quickActions = [
    {
      icon: MessageSquarePlus,
      title: "New Chat",
      detail: "Start a fresh conversation",
      shortcut: "mod+n",
      run: () => startNewChat(),
    },
    {
      icon: FileUp,
      title: "Import Documents",
      detail: documentCount ? `${documentCount} in your library` : "PDF, Markdown, text, and more",
      run: async () => {
        const before = libraryStore.getState().documents.length;
        await importDocuments();
        if (libraryStore.getState().documents.length > before) navigate({ page: "library" });
      },
    },
    {
      icon: FolderPlus,
      title: "New Project",
      detail: projects.length ? plural(projects.length, "active project") : "Group chats and documents",
      run: () => navigate({ page: "projects" }),
    },
    {
      icon: Clock,
      title: "History",
      detail: conversations.length ? plural(conversations.length, "saved conversation") : "Your past sessions",
      shortcut: "mod+5",
      run: () => navigate({ page: "history" }),
    },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Toolbar />
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[760px] px-8 pt-10 pb-12">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: EASE }}
          >
            <p className="text-[12.5px] font-medium text-brand">AI Workspace</p>
            <h1 className="mt-1 font-heading text-[28px] font-semibold tracking-[-0.025em]">
              {greeting()}. What are we working on?
            </h1>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.05, ease: EASE }}
            className="mt-6"
          >
            <Composer
              autoFocus
              streaming={busy}
              onStop={() => void chatStore.getState().stop()}
              sendOnEnter={sendOnEnter}
              placeholder="Ask anything to start a new chat…"
              modelLabel="Local Preview"
              onSend={(text) => {
                navigate({ page: "chat", conversationId: null });
                void chatStore.getState().open(null).then(() => chatStore.getState().send(text));
              }}
            />
          </motion.div>

          <div className="mt-8 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            {quickActions.map((a, i) => (
              <motion.button
                key={a.title}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: 0.1 + i * 0.04, ease: EASE }}
                onClick={() => void a.run()}
                className="group flex flex-col items-start rounded-xl border border-border bg-surface-raised p-3.5 text-left shadow-[var(--shadow-window)] transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-float)]"
              >
                <div className="flex w-full items-center justify-between">
                  <span className="flex size-7 items-center justify-center rounded-lg bg-brand-soft text-brand">
                    <a.icon className="size-3.5" />
                  </span>
                  {a.shortcut && (
                    <Shortcut keys={a.shortcut} className="opacity-0 transition-opacity group-hover:opacity-100" />
                  )}
                </div>
                <span className="mt-3 text-[12.5px] font-semibold">{a.title}</span>
                <span className="mt-0.5 line-clamp-1 text-[11.5px] text-muted-foreground">{a.detail}</span>
              </motion.button>
            ))}
          </div>

          <section className="mt-10">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-[12px] font-semibold text-muted-foreground">Recent Conversations</h2>
              {conversations.length > recent.length && (
                <button
                  onClick={() => navigate({ page: "history" })}
                  className="flex items-center gap-1 text-[12px] text-brand hover:underline"
                >
                  View all <ArrowRight className="size-3" />
                </button>
              )}
            </div>
            {!loaded ? (
              <div className="space-y-1.5">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-14 animate-pulse rounded-xl bg-muted/60" />
                ))}
              </div>
            ) : recent.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border">
                <EmptyState
                  icon={MessagesSquare}
                  title="No conversations yet"
                  description="Ask a question above and your conversations will appear here, saved privately on this Mac."
                  className="py-10"
                />
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-border bg-surface-raised shadow-[var(--shadow-window)]">
                {recent.map((c, i) => {
                  const project = projects.find((p) => p.id === c.projectId);
                  return (
                    <button
                      key={c.id}
                      onClick={() => navigate({ page: "chat", conversationId: c.id })}
                      className={`flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-muted/60 ${i ? "border-t border-hairline" : ""}`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-[12.5px] font-medium">{conversationTitle(c.title)}</span>
                          {project && (
                            <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
                              <ProjectDot color={project.color} className="size-1.5" />
                              {project.name}
                            </span>
                          )}
                        </div>
                        {c.preview && (
                          <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">{c.preview}</p>
                        )}
                      </div>
                      <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                        {formatRelative(c.updatedAt)}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
