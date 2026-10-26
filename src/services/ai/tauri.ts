import { Channel } from "@tauri-apps/api/core";
import { call } from "@/services/ipc";
import type { AiService, ProviderInfo, StreamEvent } from "./types";

/** Streams replies from the Rust AI registry over a Tauri IPC channel. */
export const tauriAi: AiService = {
  listProviders: () => call<ProviderInfo[]>("ai_providers"),

  streamChat(request, onEvent) {
    let settle!: () => void;
    const done = new Promise<void>((resolve) => (settle = resolve));
    let finished = false;
    const finish = () => {
      if (!finished) {
        finished = true;
        settle();
      }
    };

    const channel = new Channel<StreamEvent>();
    channel.onmessage = (event) => {
      if (finished) return;
      onEvent(event);
      if (event.type === "completed" || event.type === "error") finish();
    };

    call<void>("ai_stream_chat", { request, onEvent: channel }).catch((error: unknown) => {
      if (finished) return;
      onEvent({ type: "error", message: error instanceof Error ? error.message : String(error) });
      finish();
    });

    return {
      done,
      async cancel() {
        if (!finished) await call<boolean>("ai_cancel", { requestId: request.requestId });
      },
    };
  },
};
