import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUp, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { Shortcut } from "@/components/common/primitives";

export interface ComposerHandle {
  focus(): void;
  setValue(value: string): void;
}

interface ComposerProps {
  onSend: (text: string) => void;
  onStop?: () => void;
  streaming?: boolean;
  sendOnEnter: boolean;
  placeholder?: string;
  modelLabel?: string;
  autoFocus?: boolean;
  className?: string;
}

const MAX_HEIGHT = 220;

export const Composer = forwardRef<ComposerHandle, ComposerProps>(function Composer(
  { onSend, onStop, streaming = false, sendOnEnter, placeholder = "Message AI Workspace…", modelLabel, autoFocus, className },
  ref,
) {
  const [value, setValue] = useState("");
  const textarea = useRef<HTMLTextAreaElement>(null);

  useImperativeHandle(ref, () => ({
    focus: () => textarea.current?.focus(),
    setValue: (v) => {
      setValue(v);
      requestAnimationFrame(() => textarea.current?.focus());
    },
  }));

  useLayoutEffect(() => {
    const el = textarea.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
  }, [value]);

  const canSend = value.trim().length > 0 && !streaming;

  const submit = () => {
    if (!canSend) return;
    onSend(value);
    setValue("");
  };

  return (
    <div
      className={cn(
        "glass rounded-2xl border border-border shadow-[var(--shadow-float)] transition-[border-color,box-shadow] focus-within:border-ring/60",
        className,
      )}
    >
      <textarea
        ref={textarea}
        value={value}
        autoFocus={autoFocus}
        rows={1}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
          const wantsSend = sendOnEnter ? !e.shiftKey && !e.altKey : e.metaKey;
          if (wantsSend) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder={placeholder}
        aria-label="Message"
        className="scrollbar-thin block w-full resize-none bg-transparent px-4 pt-3.5 pb-1 text-[13.5px] leading-relaxed outline-none placeholder:text-muted-foreground/70"
      />
      <div className="flex items-center gap-2 px-3 pb-2.5">
        {modelLabel && (
          <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
            {modelLabel}
          </span>
        )}
        <span className="flex-1 truncate text-[11px] text-muted-foreground/70">
          {streaming ? (
            <span className="flex items-center gap-1.5">
              <Shortcut keys="esc" /> to stop
            </span>
          ) : sendOnEnter ? (
            <span className="flex items-center gap-1.5">
              <Shortcut keys="enter" /> send <Shortcut keys="shift+enter" /> new line
            </span>
          ) : (
            <span className="flex items-center gap-1.5">
              <Shortcut keys="mod+enter" /> send
            </span>
          )}
        </span>
        <AnimatePresence mode="popLayout" initial={false}>
          {streaming ? (
            <motion.button
              key="stop"
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.6, opacity: 0 }}
              onClick={onStop}
              aria-label="Stop generating"
              className="flex size-7 items-center justify-center rounded-full bg-foreground text-background transition-transform active:scale-95"
            >
              <Square className="size-2.5 fill-current" />
            </motion.button>
          ) : (
            <motion.button
              key="send"
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.6, opacity: 0 }}
              onClick={submit}
              disabled={!canSend}
              aria-label="Send message"
              className="flex size-7 items-center justify-center rounded-full bg-brand text-brand-foreground shadow-sm transition-all active:scale-95 disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none"
            >
              <ArrowUp className="size-4" strokeWidth={2.4} />
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
});
