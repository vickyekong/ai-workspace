import { useMemo, useState, type ComponentType } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertCircle,
  Code2,
  File,
  FileSpreadsheet,
  FileText,
  FileType2,
  Folder,
  FolderOpen,
  Library,
  MoreHorizontal,
  Plus,
  SearchX,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  EmptyState,
  ErrorBanner,
  IconButton,
  ProjectDot,
  SearchField,
  Spinner,
  Toolbar,
} from "@/components/common/primitives";
import { libraryStore, services, useLibrary, useProjects } from "@/app/stores";
import { formatBytes, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { DocumentKind, LibraryDocument } from "@/types/domain";
import { ProjectPicker } from "@/features/projects/project-picker";
import { ConfirmDialog } from "@/features/chat/conversation-dialogs";
import { importDocuments } from "./import";
import { kindCounts, searchDocuments, type KindFilter } from "./search";
import { plural } from "@/lib/plural";

const KIND_META: Record<DocumentKind, { label: string; icon: ComponentType<{ className?: string }>; tint: string }> = {
  pdf: { label: "PDF", icon: FileType2, tint: "text-[oklch(0.62_0.2_25)] bg-[oklch(0.62_0.2_25/0.12)]" },
  markdown: { label: "Markdown", icon: FileText, tint: "text-brand bg-brand-soft" },
  text: { label: "Text", icon: FileText, tint: "text-muted-foreground bg-muted" },
  word: { label: "Word", icon: FileText, tint: "text-[oklch(0.55_0.17_255)] bg-[oklch(0.55_0.17_255/0.12)]" },
  spreadsheet: {
    label: "Spreadsheet",
    icon: FileSpreadsheet,
    tint: "text-[oklch(0.6_0.15_150)] bg-[oklch(0.6_0.15_150/0.12)]",
  },
  code: { label: "Data", icon: Code2, tint: "text-[oklch(0.6_0.15_300)] bg-[oklch(0.6_0.15_300/0.12)]" },
  other: { label: "Other", icon: File, tint: "text-muted-foreground bg-muted" },
};

const FILTERS: KindFilter[] = ["all", "pdf", "markdown", "text", "word", "spreadsheet", "code", "other"];

export function DocumentIcon({ kind, className }: { kind: DocumentKind; className?: string }) {
  const meta = KIND_META[kind];
  return (
    <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", meta.tint, className)}>
      <meta.icon className="size-4" />
    </span>
  );
}

export function LibraryPage() {
  const documents = useLibrary((s) => s.documents);
  const loaded = useLibrary((s) => s.loaded);
  const importing = useLibrary((s) => s.importing);
  const error = useLibrary((s) => s.error);
  const [text, setText] = useState("");
  const [kind, setKind] = useState<KindFilter>("all");
  const [removing, setRemoving] = useState<LibraryDocument | null>(null);

  const counts = useMemo(() => kindCounts(documents), [documents]);
  const results = useMemo(() => searchDocuments(documents, { text, kind }), [documents, text, kind]);
  const totalSize = useMemo(() => documents.reduce((n, d) => n + d.sizeBytes, 0), [documents]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Toolbar
        title="Library"
        subtitle={documents.length ? `${plural(documents.length, "document")} · ${formatBytes(totalSize)}` : "No documents"}
      >
        <SearchField value={text} onChange={setText} placeholder="Search names and contents" className="w-60" />
        <Button size="sm" onClick={() => void importDocuments()} disabled={importing} className="ml-1">
          {importing ? <Spinner className="size-3" /> : <Plus />}
          Import
        </Button>
      </Toolbar>

      {documents.length > 0 && (
        <div className="scrollbar-thin flex shrink-0 gap-1 overflow-x-auto border-b border-hairline px-4 py-2">
          {FILTERS.filter((f) => f === "all" || counts[f] > 0).map((f) => (
            <button
              key={f}
              onClick={() => setKind(f)}
              className={cn(
                "flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[11.5px] font-medium transition-colors",
                kind === f ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {f === "all" ? "All" : KIND_META[f].label}
              <span className="tabular-nums opacity-60">{counts[f]}</span>
            </button>
          ))}
        </div>
      )}

      <AnimatePresence>
        {error && (
          <div className="px-4 pt-3">
            <ErrorBanner message={error} onDismiss={() => libraryStore.setState({ error: null })} />
          </div>
        )}
      </AnimatePresence>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
        {!loaded ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <Spinner />
          </div>
        ) : documents.length === 0 ? (
          <EmptyState
            icon={Library}
            title="Your library is empty"
            description="Import PDFs, Markdown, text, and office files. Files stay where they are — AI Workspace only stores a reference and a short excerpt for search."
            className="h-full"
          >
            <Button onClick={() => void importDocuments()} disabled={importing}>
              <Plus /> Import Documents
            </Button>
          </EmptyState>
        ) : results.length === 0 ? (
          <EmptyState
            icon={SearchX}
            title="No matching documents"
            description="Try a different search term or filter."
            className="h-full"
          >
            <Button
              variant="outline"
              onClick={() => {
                setText("");
                setKind("all");
              }}
            >
              Clear Filters
            </Button>
          </EmptyState>
        ) : (
          <div className="px-3 py-2">
            <AnimatePresence initial={false}>
              {results.map((doc) => (
                <DocumentRow key={doc.id} doc={doc} onRemove={() => setRemoving(doc)} />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="Remove from Library?"
        description={`“${removing?.name ?? ""}” will be removed from AI Workspace. The original file on disk is not touched.`}
        confirmLabel="Remove"
        onConfirm={() => removing && void libraryStore.getState().remove(removing.id)}
      />
    </div>
  );
}

function DocumentRow({ doc, onRemove }: { doc: LibraryDocument; onRemove: () => void }) {
  const project = useProjects((s) => s.projects.find((p) => p.id === doc.projectId) ?? null);

  return (
    <motion.div
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, height: 0 }}
      className="group flex items-center gap-3 rounded-lg px-2.5 py-2 transition-colors hover:bg-muted/60"
    >
      <DocumentIcon kind={doc.kind} className={cn(!doc.available && "opacity-50")} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={cn("truncate text-[13px] font-medium", !doc.available && "text-muted-foreground")}>
            {doc.name}
          </span>
          {!doc.available && (
            <span className="flex shrink-0 items-center gap-1 rounded-full bg-warning/15 px-1.5 py-px text-[10.5px] font-medium text-warning">
              <AlertCircle className="size-3" /> Missing
            </span>
          )}
          {project && (
            <span className="flex shrink-0 items-center gap-1 rounded-full bg-muted px-1.5 py-px text-[10.5px] text-muted-foreground">
              <ProjectDot color={project.color} className="size-1.5" />
              {project.name}
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
          {doc.excerpt ?? doc.path}
        </p>
      </div>
      <div className="hidden shrink-0 text-right text-[11px] text-muted-foreground tabular-nums md:block">
        <div>{formatBytes(doc.sizeBytes)}</div>
        <div>{formatRelative(doc.importedAt)}</div>
      </div>
      <div className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100 has-[[data-state=open]]:opacity-100">
        <ProjectPicker value={doc.projectId} onChange={(pid) => void libraryStore.getState().setProject(doc.id, pid)}>
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
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem
              disabled={!doc.available || services.runtime === "browser"}
              onSelect={() => void libraryStore.getState().reveal(doc.id)}
            >
              <FolderOpen /> Show in Finder
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={onRemove}>
              <Trash2 /> Remove from Library
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </motion.div>
  );
}
