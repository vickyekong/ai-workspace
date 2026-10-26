import { memo, useState } from "react";
import { motion } from "motion/react";
import { Check, CircleSlash, Copy, Sparkles, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/format";
import type { Role, PersistedMessageStatus } from "@/types/domain";
import { Markdown } from "./markdown";

interface MessageItemProps {
  role: Role;
  content: string;
  status: PersistedMessageStatus | "streaming";
  createdAt?: number;
  error?: string | null;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1400);
        });
      }}
      className="flex items-center gap-1 rounded px-1 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      aria-label="Copy message"
    >
      {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export const MessageItem = memo(function MessageItem({ role, content, status, createdAt, error }: MessageItemProps) {
  const streaming = status === "streaming";

  if (role === "user") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
        className="group flex flex-col items-end"
      >
        <div className="selectable max-w-[85%] rounded-[18px] rounded-br-md bg-brand px-3.5 py-2 text-[13px] leading-relaxed whitespace-pre-wrap text-brand-foreground shadow-sm">
          {content}
        </div>
        {createdAt && (
          <span className="mt-1 mr-1 text-[10.5px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
            {formatTime(createdAt)}
          </span>
        )}
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
      className="group flex gap-3"
    >
      <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand to-[oklch(0.62_0.19_calc(var(--brand-h)_+_50))] text-brand-foreground shadow-sm">
        <Sparkles className="size-3" />
      </div>
      <div className="min-w-0 flex-1">
        <div
          className={cn(
            "selectable text-[13px] leading-[1.65] text-foreground",
            status === "error" && "text-foreground/80",
          )}
          aria-live={streaming ? "polite" : undefined}
          aria-busy={streaming}
        >
          {content ? (
            <Markdown content={content} />
          ) : streaming ? (
            <ThinkingDots />
          ) : null}
          {streaming && content && (
            <span className="ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[3px] animate-pulse rounded-full bg-brand" />
          )}
        </div>

        {(status === "cancelled" || status === "error") && (
          <div
            className={cn(
              "mt-2 inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[11px]",
              status === "error" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground",
            )}
          >
            {status === "error" ? <TriangleAlert className="size-3" /> : <CircleSlash className="size-3" />}
            {status === "error" ? (error ?? "Response failed") : "Stopped"}
          </div>
        )}

        {!streaming && content && (
          <div className="mt-1.5 flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            <CopyButton text={content} />
            {createdAt && <span className="text-[10.5px] text-muted-foreground">{formatTime(createdAt)}</span>}
          </div>
        )}
      </div>
    </motion.div>
  );
});

function ThinkingDots() {
  return (
    <span className="inline-flex h-5 items-center gap-1" aria-label="Thinking">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="size-1.5 rounded-full bg-muted-foreground/60"
          animate={{ opacity: [0.3, 1, 0.3], y: [0, -2, 0] }}
          transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }}
        />
      ))}
    </span>
  );
}
