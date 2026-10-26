import type { CSSProperties, ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { PanelLeft, SquarePen } from "lucide-react";
import { IconButton } from "@/components/common/primitives";
import { useSettings } from "@/app/stores";
import { startNewChat, toggleSidebar } from "@/app/use-shortcuts";
import { Sidebar } from "./sidebar";

const SIDEBAR_WIDTH = 236;
const EASE = [0.32, 0.72, 0, 1] as const;

export function AppShell({ pageKey, children }: { pageKey: string; children: ReactNode }) {
  const collapsed = useSettings((s) => s.settings.sidebarCollapsed);

  return (
    <div className="flex h-full">
      <motion.div
        initial={false}
        animate={{ width: collapsed ? 0 : SIDEBAR_WIDTH }}
        transition={{ duration: 0.32, ease: EASE }}
        className="h-full shrink-0 overflow-hidden"
        aria-hidden={collapsed}
        inert={collapsed}
      >
        <div style={{ width: SIDEBAR_WIDTH }} className="h-full">
          <Sidebar />
        </div>
      </motion.div>

      <main
        className="relative flex min-w-0 flex-1 flex-col overflow-hidden border-l border-hairline bg-background"
        style={{ "--toolbar-inset": collapsed ? "140px" : "16px" } as CSSProperties}
      >
        <AnimatePresence>
          {collapsed && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { delay: 0.15 } }}
              exit={{ opacity: 0, transition: { duration: 0.1 } }}
              className="absolute top-[11px] left-[78px] z-20 flex gap-0.5"
            >
              <IconButton label="Show Sidebar" shortcut="mod+\" onClick={toggleSidebar}>
                <PanelLeft />
              </IconButton>
              <IconButton label="New Chat" shortcut="mod+n" onClick={() => startNewChat()}>
                <SquarePen />
              </IconButton>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={pageKey}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.08 } }}
            transition={{ duration: 0.22, ease: EASE }}
            className="flex min-h-0 flex-1 flex-col"
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
