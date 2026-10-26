import { useStore } from "zustand";
import { createChatStore } from "@/features/chat/chat-store";
import { createLibraryStore } from "@/features/library/library-store";
import { createProjectsStore } from "@/features/projects/projects-store";
import { createSettingsStore } from "@/features/settings/settings-store";
import { createServices } from "@/services";
import { createNavigationStore } from "./navigation";

export const services = createServices();

export const settingsStore = createSettingsStore(services.settings);
export const navigationStore = createNavigationStore();
export const chatStore = createChatStore({
  conversations: services.conversations,
  ai: services.ai,
  getProviderId: () => settingsStore.getState().settings.defaultProviderId,
  onConversationCreated: (conversationId) => {
    const { route, replace } = navigationStore.getState();
    if (route.page === "chat" && route.conversationId === null) {
      replace({ page: "chat", conversationId });
    }
  },
});
export const libraryStore = createLibraryStore(services.documents);
export const projectsStore = createProjectsStore(services.projects, {
  onRemoved: () => {
    void chatStore.getState().loadConversations();
    void libraryStore.getState().load();
  },
});

// Project counts derive from assignments, so refresh them when those change.
let projectRefresh: ReturnType<typeof setTimeout> | undefined;
const scheduleProjectRefresh = () => {
  clearTimeout(projectRefresh);
  projectRefresh = setTimeout(() => void projectsStore.getState().load(), 150);
};
chatStore.subscribe((s, prev) => {
  if (s.conversations !== prev.conversations) scheduleProjectRefresh();
});
libraryStore.subscribe((s, prev) => {
  if (s.documents !== prev.documents) scheduleProjectRefresh();
});

export const useSettings = <T>(selector: (s: ReturnType<typeof settingsStore.getState>) => T) =>
  useStore(settingsStore, selector);
export const useNavigation = <T>(selector: (s: ReturnType<typeof navigationStore.getState>) => T) =>
  useStore(navigationStore, selector);
export const useChat = <T>(selector: (s: ReturnType<typeof chatStore.getState>) => T) =>
  useStore(chatStore, selector);
export const useLibrary = <T>(selector: (s: ReturnType<typeof libraryStore.getState>) => T) =>
  useStore(libraryStore, selector);
export const useProjects = <T>(selector: (s: ReturnType<typeof projectsStore.getState>) => T) =>
  useStore(projectsStore, selector);

export async function bootstrap(): Promise<void> {
  await settingsStore.getState().load();
  await Promise.all([
    chatStore.getState().loadConversations(),
    projectsStore.getState().load(),
    libraryStore.getState().load(),
  ]);
}
