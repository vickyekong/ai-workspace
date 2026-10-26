import { useEffect } from "react";
import { chatStore, navigationStore, settingsStore } from "./stores";
import type { Route } from "./navigation";

const PAGE_SHORTCUTS: Record<string, Route> = {
  "1": { page: "home" },
  "2": { page: "chat", conversationId: null },
  "3": { page: "library" },
  "4": { page: "projects" },
  "5": { page: "history" },
};

export function startNewChat(projectId: string | null = null) {
  navigationStore.getState().navigate({ page: "chat", conversationId: null, projectId });
}

export function toggleSidebar() {
  const { settings, update } = settingsStore.getState();
  void update({ sidebarCollapsed: !settings.sidebarCollapsed });
}

/** Global keyboard shortcuts following macOS conventions. */
export function useGlobalShortcuts() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const nav = navigationStore.getState();

      if (e.key === "Escape" && chatStore.getState().stream) {
        void chatStore.getState().stop();
        return;
      }
      if (!e.metaKey || e.altKey) return;
      const key = e.key.toLowerCase();

      if (!e.ctrlKey && !e.shiftKey && PAGE_SHORTCUTS[key]) {
        e.preventDefault();
        const route = PAGE_SHORTCUTS[key]!;
        if (route.page === "chat") {
          // ⌘2 returns to the open conversation rather than a blank draft.
          nav.navigate({ page: "chat", conversationId: chatStore.getState().activeId });
        } else {
          nav.navigate(route);
        }
        return;
      }

      switch (true) {
        case key === "n" && !e.shiftKey:
          e.preventDefault();
          startNewChat();
          break;
        case key === ",":
          e.preventDefault();
          nav.navigate({ page: "settings" });
          break;
        case key === "\\" || (key === "s" && e.ctrlKey):
          e.preventDefault();
          toggleSidebar();
          break;
        case key === "[":
          e.preventDefault();
          nav.back();
          break;
        case key === "]":
          e.preventDefault();
          nav.forward();
          break;
        case key === "f": {
          const field = document.querySelector<HTMLInputElement>("[data-search-field]");
          if (field) {
            e.preventDefault();
            field.focus();
            field.select();
          }
          break;
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
