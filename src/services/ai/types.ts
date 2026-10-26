import type { Role } from "@/types/domain";

export type ProviderStatus = "ready" | "needs_configuration";

export interface ProviderInfo {
  id: string;
  name: string;
  description: string;
  model: string;
  isLocal: boolean;
  status: ProviderStatus;
}

export interface ChatTurn {
  role: Role;
  content: string;
}

export interface ChatRequest {
  requestId: string;
  providerId?: string | null;
  messages: ChatTurn[];
}

export type FinishReason = "stop" | "cancelled";

/** Mirrors `StreamEvent` in `src-tauri/src/ai/mod.rs`. */
export type StreamEvent =
  | { type: "started"; providerId: string; model: string }
  | { type: "delta"; text: string }
  | { type: "completed"; finishReason: FinishReason }
  | { type: "error"; message: string };

export interface StreamHandle {
  cancel(): Promise<void>;
  /** Resolves after the terminal `completed` or `error` event. */
  done: Promise<void>;
}

/**
 * Provider-agnostic AI client. Implementations never hold credentials in the
 * webview; remote providers are reached through the Rust backend.
 */
export interface AiService {
  listProviders(): Promise<ProviderInfo[]>;
  streamChat(request: ChatRequest, onEvent: (event: StreamEvent) => void): StreamHandle;
}
