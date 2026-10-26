import { useEffect, useState } from "react";
import { MotionConfig } from "motion/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { AppShell } from "@/components/layout/app-shell";
import { ChatPage } from "@/features/chat/chat-page";
import { HistoryPage } from "@/features/history/history-page";
import { HomePage } from "@/features/home/home-page";
import { LibraryPage } from "@/features/library/library-page";
import { ProjectsPage } from "@/features/projects/projects-page";
import { SettingsPage } from "@/features/settings/settings-page";
import type { Route } from "./navigation";
import { bootstrap, useNavigation, useSettings } from "./stores";
import { useGlobalShortcuts } from "./use-shortcuts";
import { useApplyTheme } from "./use-theme";

function renderPage(route: Route) {
  switch (route.page) {
    case "home":
      return <HomePage />;
    case "chat":
      return <ChatPage conversationId={route.conversationId} projectId={route.projectId ?? null} />;
    case "library":
      return <LibraryPage />;
    case "projects":
      return <ProjectsPage projectId={route.projectId ?? null} />;
    case "history":
      return <HistoryPage />;
    case "settings":
      return <SettingsPage />;
  }
}

/** Separate pages animate on change; switching projects or chats updates in place. */
function pageKey(route: Route): string {
  if (route.page === "projects") return route.projectId ? "project-detail" : "projects";
  return route.page;
}

export function App() {
  const [ready, setReady] = useState(false);
  const route = useNavigation((s) => s.route);
  const reduceMotion = useSettings((s) => s.settings.reduceMotion);
  const resolvedTheme = useApplyTheme();
  useGlobalShortcuts();

  useEffect(() => {
    void bootstrap().finally(() => setReady(true));
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("reduce-motion", reduceMotion);
  }, [reduceMotion]);

  return (
    <MotionConfig reducedMotion={reduceMotion ? "always" : "user"}>
      <TooltipProvider delayDuration={600} skipDelayDuration={200}>
        {ready ? (
          <AppShell pageKey={pageKey(route)}>{renderPage(route)}</AppShell>
        ) : (
          <div data-tauri-drag-region className="h-full" />
        )}
        <Toaster theme={resolvedTheme} position="bottom-right" />
      </TooltipProvider>
    </MotionConfig>
  );
}
