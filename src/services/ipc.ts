import { invoke, type InvokeArgs } from "@tauri-apps/api/core";
import type { AppError } from "@/types/domain";

/** Commands exposed by `src-tauri/src/commands.rs`. */
export type Command =
  | "conversations_list"
  | "conversations_create"
  | "conversations_rename"
  | "conversations_set_project"
  | "conversations_delete"
  | "conversations_delete_all"
  | "messages_list"
  | "messages_append"
  | "projects_list"
  | "projects_create"
  | "projects_update"
  | "projects_delete"
  | "documents_list"
  | "documents_import"
  | "documents_set_project"
  | "documents_remove"
  | "documents_reveal"
  | "settings_load"
  | "settings_save"
  | "app_info"
  | "app_reveal_data_dir"
  | "ai_providers"
  | "ai_stream_chat"
  | "ai_cancel";

export class IpcError extends Error implements AppError {
  readonly kind: AppError["kind"];

  constructor(kind: AppError["kind"], message: string) {
    super(message);
    this.name = "IpcError";
    this.kind = kind;
  }
}

export function toAppError(error: unknown): IpcError {
  if (error instanceof IpcError) return error;
  if (error && typeof error === "object" && "kind" in error && "message" in error) {
    const { kind, message } = error as AppError;
    return new IpcError(kind, String(message));
  }
  if (error instanceof Error) return new IpcError("unknown", error.message);
  return new IpcError("unknown", String(error));
}

export async function call<T>(command: Command, args?: InvokeArgs): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    throw toAppError(error);
  }
}
