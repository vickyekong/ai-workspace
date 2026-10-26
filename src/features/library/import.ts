import { toast } from "sonner";
import { libraryStore, services } from "@/app/stores";
import type { ImportResult } from "@/types/domain";
import { plural } from "@/lib/plural";

export function notifyImport(result: ImportResult) {
  if (result.cancelled) return;
  const parts: string[] = [];
  if (result.imported.length) parts.push(`${result.imported.length} imported`);
  if (result.duplicates) parts.push(`${plural(result.duplicates, "duplicate")} skipped`);
  if (result.failed.length) parts.push(`${result.failed.length} failed`);
  const message = parts.join(" · ") || "Nothing imported";
  if (result.failed.length && !result.imported.length) {
    toast.error(message, { description: result.failed.map((f) => `${f.name}: ${f.reason}`).join("\n") });
  } else {
    toast.success(message);
  }
}

export async function importDocuments() {
  if (services.runtime === "browser") {
    toast.info("Importing documents requires the desktop app", {
      description: "Run `npm run tauri dev` to use the native file picker.",
    });
    return;
  }
  const result = await libraryStore.getState().importDocuments();
  if (result) notifyImport(result);
}
