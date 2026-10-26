import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ChevronLeft,
  FileText,
  FolderKanban,
  MessageSquare,
  MessageSquarePlus,
  MoreHorizontal,
  PenLine,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState, ErrorBanner, IconButton, ProjectDot, Toolbar } from "@/components/common/primitives";
import { navigationStore, projectsStore, useChat, useLibrary, useProjects } from "@/app/stores";
import { startNewChat } from "@/app/use-shortcuts";
import { formatRelative } from "@/lib/format";
import { conversationTitle } from "@/lib/text";
import { cn } from "@/lib/utils";
import { PROJECT_COLORS, type Project, type ProjectColor } from "@/types/domain";
import { ConfirmDialog } from "@/features/chat/conversation-dialogs";
import { DocumentIcon } from "@/features/library/library-page";
import { plural } from "@/lib/plural";

const EASE = [0.32, 0.72, 0, 1] as const;

export function ProjectsPage({ projectId }: { projectId: string | null }) {
  const projects = useProjects((s) => s.projects);
  const project = projectId ? projects.find((p) => p.id === projectId) : undefined;
  return project ? <ProjectDetail project={project} /> : <ProjectGrid />;
}

function ProjectGrid() {
  const projects = useProjects((s) => s.projects);
  const loaded = useProjects((s) => s.loaded);
  const error = useProjects((s) => s.error);
  const [creating, setCreating] = useState(false);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Toolbar title="Projects" subtitle={plural(projects.length, "project")}>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus /> New Project
        </Button>
      </Toolbar>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
        <AnimatePresence>
          {error && (
            <div className="px-6 pt-4">
              <ErrorBanner message={error} onDismiss={() => projectsStore.setState({ error: null })} />
            </div>
          )}
        </AnimatePresence>
        {loaded && projects.length === 0 ? (
          <EmptyState
            icon={FolderKanban}
            title="Organize your work"
            description="Projects group related conversations and documents so context stays together."
            className="h-full"
          >
            <Button onClick={() => setCreating(true)}>
              <Plus /> Create a Project
            </Button>
          </EmptyState>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-3 p-6">
            {projects.map((p, i) => (
              <motion.button
                key={p.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: Math.min(i, 8) * 0.03, ease: EASE }}
                onClick={() => navigationStore.getState().navigate({ page: "projects", projectId: p.id })}
                className="group flex flex-col rounded-xl border border-border bg-surface-raised p-4 text-left shadow-[var(--shadow-window)] transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-float)]"
              >
                <div className="flex items-center gap-2">
                  <ProjectDot color={p.color} className="size-2.5" />
                  <span className="truncate text-[13px] font-semibold">{p.name}</span>
                </div>
                <p className="mt-1.5 line-clamp-2 min-h-[2.6em] text-[12px] leading-relaxed text-muted-foreground">
                  {p.description || "No description"}
                </p>
                <div className="mt-3 flex items-center gap-3 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <MessageSquare className="size-3" /> {p.conversationCount}
                  </span>
                  <span className="flex items-center gap-1">
                    <FileText className="size-3" /> {p.documentCount}
                  </span>
                  <span className="ml-auto">{formatRelative(p.updatedAt)}</span>
                </div>
              </motion.button>
            ))}
          </div>
        )}
      </div>

      <ProjectDialog open={creating} onOpenChange={setCreating} />
    </div>
  );
}

function ProjectDetail({ project }: { project: Project }) {
  const allConversations = useChat((s) => s.conversations);
  const allDocuments = useLibrary((s) => s.documents);
  const conversations = useMemo(
    () => allConversations.filter((c) => c.projectId === project.id),
    [allConversations, project.id],
  );
  const documents = useMemo(
    () => allDocuments.filter((d) => d.projectId === project.id),
    [allDocuments, project.id],
  );
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const navigate = navigationStore.getState().navigate;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Toolbar
        leading={
          <IconButton label="All Projects" onClick={() => navigate({ page: "projects" })}>
            <ChevronLeft />
          </IconButton>
        }
        title={
          <span className="flex items-center gap-2">
            <ProjectDot color={project.color} /> {project.name}
          </span>
        }
        subtitle={project.description || undefined}
      >
        <Button size="sm" variant="outline" onClick={() => startNewChat(project.id)}>
          <MessageSquarePlus /> New Chat
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton label="More">
              <MoreHorizontal />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onSelect={() => setEditing(true)}>
              <PenLine /> Edit Project…
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(true)}>
              <Trash2 /> Delete Project
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </Toolbar>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto grid max-w-[1000px] gap-6 p-6 lg:grid-cols-2">
          <Section title="Conversations" count={conversations.length}>
            {conversations.length === 0 ? (
              <EmptyState
                icon={MessageSquare}
                title="No conversations"
                description="Start a chat here, or move an existing one from its menu."
                className="py-8"
              >
                <Button size="sm" variant="outline" onClick={() => startNewChat(project.id)}>
                  New Chat
                </Button>
              </EmptyState>
            ) : (
              conversations.map((c) => (
                <button
                  key={c.id}
                  onClick={() => navigate({ page: "chat", conversationId: c.id })}
                  className="flex w-full items-center gap-3 border-t border-hairline px-3.5 py-2.5 text-left first:border-t-0 hover:bg-muted/60"
                >
                  <MessageSquare className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">{conversationTitle(c.title)}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{formatRelative(c.updatedAt)}</span>
                </button>
              ))
            )}
          </Section>
          <Section title="Documents" count={documents.length}>
            {documents.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="No documents"
                description="Assign documents to this project from the Library."
                className="py-8"
              >
                <Button size="sm" variant="outline" onClick={() => navigate({ page: "library" })}>
                  Open Library
                </Button>
              </EmptyState>
            ) : (
              documents.map((d) => (
                <div key={d.id} className="flex items-center gap-3 border-t border-hairline px-3.5 py-2 first:border-t-0">
                  <DocumentIcon kind={d.kind} className="size-7" />
                  <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">{d.name}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{formatRelative(d.importedAt)}</span>
                </div>
              ))
            )}
          </Section>
        </div>
      </div>

      <ProjectDialog open={editing} onOpenChange={setEditing} project={project} />
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete “${project.name}”?`}
        description="Conversations and documents in this project are kept and moved out of it."
        onConfirm={() => {
          void projectsStore.getState().remove(project.id);
          navigate({ page: "projects" });
        }}
      />
    </div>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 flex items-center gap-2 text-[12px] font-semibold text-muted-foreground">
        {title} <span className="rounded-full bg-muted px-1.5 text-[10.5px] tabular-nums">{count}</span>
      </h2>
      <div className="overflow-hidden rounded-xl border border-border bg-surface-raised shadow-[var(--shadow-window)]">
        {children}
      </div>
    </section>
  );
}

function ProjectDialog({
  open,
  onOpenChange,
  project,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project?: Project;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState<ProjectColor>("blue");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(project?.name ?? "");
    setDescription(project?.description ?? "");
    setColor(project?.color ?? PROJECT_COLORS[Math.floor(Math.random() * 6)]!);
  }, [open, project]);

  const submit = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    const input = { name, description, color };
    const result = project
      ? await projectsStore.getState().update(project.id, input)
      : await projectsStore.getState().create(input);
    setSaving(false);
    if (result) {
      onOpenChange(false);
      if (!project) navigationStore.getState().navigate({ page: "projects", projectId: result.id });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <DialogHeader>
            <DialogTitle>{project ? "Edit Project" : "New Project"}</DialogTitle>
            <DialogDescription>Group related conversations and documents.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <label htmlFor="project-name" className="text-[12px] font-medium">
              Name
            </label>
            <Input
              id="project-name"
              autoFocus
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Product Launch"
            />
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="project-description" className="text-[12px] font-medium">
              Description <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <Textarea
              id="project-description"
              maxLength={500}
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this project about?"
              className="resize-none"
            />
          </div>
          <div className="grid gap-1.5">
            <span className="text-[12px] font-medium">Color</span>
            <div className="flex gap-2" role="radiogroup" aria-label="Project color">
              {PROJECT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={color === c}
                  aria-label={c}
                  onClick={() => setColor(c)}
                  className={cn(
                    "flex size-6 items-center justify-center rounded-full ring-offset-2 ring-offset-popover transition-all",
                    color === c ? "ring-2 ring-foreground/30" : "hover:scale-110",
                  )}
                >
                  <ProjectDot color={c} className="size-4" />
                </button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || saving}>
              {project ? "Save" : "Create Project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
