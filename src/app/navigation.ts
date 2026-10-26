import { createStore } from "zustand/vanilla";

export type Page = "home" | "chat" | "library" | "projects" | "history" | "settings";

export type Route =
  | { page: "home" }
  | { page: "chat"; conversationId: string | null; projectId?: string | null }
  | { page: "library" }
  | { page: "projects"; projectId?: string | null }
  | { page: "history" }
  | { page: "settings" };

export interface NavigationState {
  route: Route;
  past: Route[];
  future: Route[];
  navigate(route: Route): void;
  back(): void;
  forward(): void;
  /** Replaces the current entry without growing history (e.g. after a chat is created). */
  replace(route: Route): void;
}

const MAX_HISTORY = 50;

export function sameRoute(a: Route, b: Route): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function createNavigationStore(initial: Route = { page: "home" }) {
  return createStore<NavigationState>()((set, get) => ({
    route: initial,
    past: [],
    future: [],
    navigate(route) {
      const { route: current, past } = get();
      if (sameRoute(current, route)) return;
      set({ route, past: [...past, current].slice(-MAX_HISTORY), future: [] });
    },
    back() {
      const { past, route, future } = get();
      const previous = past[past.length - 1];
      if (!previous) return;
      set({ route: previous, past: past.slice(0, -1), future: [route, ...future] });
    },
    forward() {
      const { past, route, future } = get();
      const [next, ...rest] = future;
      if (!next) return;
      set({ route: next, past: [...past, route], future: rest });
    },
    replace(route) {
      set({ route });
    },
  }));
}

export type NavigationStore = ReturnType<typeof createNavigationStore>;
