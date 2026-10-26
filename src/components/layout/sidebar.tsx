import type { ComponentType } from "react";
import { motion } from "motion/react";
import {
  Clock,
  FolderKanban,
  House,
  Library,
  MessageSquare,
  PanelLeft,
  Settings,
  SquarePen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { conversationTitle } from "@/lib/text";
import { IconButton, ProjectDot, Shortcut } from "@/components/common/primitives";
import { useChat, useNavigation, useProjects, navigationStore, services } from "@/app/stores";
import { startNewChat, toggleSidebar } from "@/app/use-shortcuts";
import type { Page, Route } from "@/app/navigation";

interface NavItem {
  page: Page;
  label: string;
  icon: ComponentType<{ className?: string }>;
  shortcut: string;
  route: () => Route;
}

const NAV: NavItem[] = [
  { page: "home", label: "Home", icon: House, shortcut: "mod+1", route: () => ({ page: "home" }) },
  {
    page: "chat",
    label: "Chat",
    icon: MessageSquare,
    shortcut: "mod+2",
    route: () => ({ page: "chat", conversationId: null }),
  },
  { page: "library", label: "Library", icon: Library, shortcut: "mod+3", route: () => ({ page: "library" }) },
  { page: "projects", label: "Projects", icon: FolderKanban, shortcut: "mod+4", route: () => ({ page: "projects" }) },
  { page: "history", label: "History", icon: Clock, shortcut: "mod+5", route: () => ({ page: "history" }) },
];

function SidebarRow({
  active,
  onClick,
  icon: Icon,
  label,
  trailing,
  className,
}: {
  active: boolean;
  onClick: () => void;
  icon?: ComponentType<{ className?: string }>;
  label: React.ReactNode;
  trailing?: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-[12.5px] transition-colors duration-150",
        active
          ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
          : "text-sidebar-foreground/85 hover:bg-sidebar-accent/60",
        className,
      )}
    >
      {Icon && <Icon className={cn("size-[15px] shrink-0", active ? "text-brand" : "opacity-70")} />}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {trailing}
    </button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2 pt-4 pb-1 text-[10.5px] font-semibold tracking-wide text-muted-foreground/80 uppercase">
      {children}
    </div>
  );
}

export function Sidebar() {
  const route = useNavigation((s) => s.route);
  const conversations = useChat((s) => s.conversations);
  const activeId = useChat((s) => s.activeId);
  const streamingId = useChat((s) => s.stream?.conversationId ?? null);
  const projects = useProjects((s) => s.projects);
  const navigate = navigationStore.getState().navigate;

  const recent = conversations.slice(0, 8);
  const activeProjectId = route.page === "projects" ? (route.projectId ?? null) : null;

  return (
    <aside className="flex h-full w-full flex-col bg-sidebar text-sidebar-foreground">
      <div data-tauri-drag-region className="flex h-[52px] shrink-0 items-center justify-end gap-0.5 pr-2 pl-20">
        <IconButton label="Hide Sidebar" shortcut="mod+\" onClick={toggleSidebar}>
          <PanelLeft />
        </IconButton>
        <IconButton label="New Chat" shortcut="mod+n" onClick={() => startNewChat()}>
          <SquarePen />
        </IconButton>
      </div>

      <nav className="scrollbar-thin flex-1 overflow-y-auto px-2.5 pb-3" aria-label="Main">
        <div className="space-y-px">
          {NAV.map((item) => (
            <SidebarRow
              key={item.page}
              active={route.page === item.page && !(item.page === "projects" && activeProjectId)}
              onClick={() =>
                item.page === "chat"
                  ? navigate({ page: "chat", conversationId: activeId })
                  : navigate(item.route())
              }
              icon={item.icon}
              label={item.label}
              trailing={
                <Shortcut
                  keys={item.shortcut}
                  className="bg-transparent opacity-0 transition-opacity group-hover:opacity-60"
                />
              }
            />
          ))}
        </div>

        {recent.length > 0 && (
          <>
            <SectionLabel>Recent</SectionLabel>
            <div className="space-y-px">
              {recent.map((c) => (
                <SidebarRow
                  key={c.id}
                  active={route.page === "chat" && route.conversationId === c.id}
                  onClick={() => navigate({ page: "chat", conversationId: c.id })}
                  label={conversationTitle(c.title)}
                  className="text-[12px]"
                  trailing={
                    streamingId === c.id ? (
                      <motion.span
                        className="size-1.5 rounded-full bg-brand"
                        animate={{ opacity: [0.3, 1, 0.3] }}
                        transition={{ duration: 1.2, repeat: Infinity }}
                      />
                    ) : null
                  }
                />
              ))}
            </div>
          </>
        )}

        {projects.length > 0 && (
          <>
            <SectionLabel>Projects</SectionLabel>
            <div className="space-y-px">
              {projects.slice(0, 8).map((p) => (
                <SidebarRow
                  key={p.id}
                  active={activeProjectId === p.id}
                  onClick={() => navigate({ page: "projects", projectId: p.id })}
                  label={
                    <span className="flex items-center gap-2">
                      <ProjectDot color={p.color} />
                      <span className="truncate">{p.name}</span>
                    </span>
                  }
                  className="text-[12px]"
                />
              ))}
            </div>
          </>
        )}
      </nav>

      <div className="shrink-0 space-y-1 border-t border-sidebar-border px-2.5 py-2">
        <SidebarRow
          active={route.page === "settings"}
          onClick={() => navigate({ page: "settings" })}
          icon={Settings}
          label="Settings"
          trailing={
            <Shortcut keys="mod+," className="bg-transparent opacity-0 transition-opacity group-hover:opacity-60" />
          }
        />
        <div className="flex items-center gap-2 px-2 pt-0.5 text-[11px] text-muted-foreground">
          <span className="size-1.5 shrink-0 rounded-full bg-success shadow-[0_0_0_2px_color-mix(in_oklch,var(--success)_20%,transparent)]" />

          <span className="truncate">
            Local Preview · {services.runtime === "desktop" ? "On-device" : "Browser"}
          </span>
        </div>
      </div>
    </aside>
  );
}
