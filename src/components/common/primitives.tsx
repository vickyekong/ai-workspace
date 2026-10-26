import { forwardRef, type ComponentProps, type ReactNode } from "react";
import { motion } from "motion/react";
import { AlertTriangle, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ProjectColor } from "@/types/domain";

/** Renders a shortcut like "mod+shift+n" as macOS glyphs. */
export function Shortcut({ keys, className }: { keys: string; className?: string }) {
  const glyph: Record<string, string> = {
    mod: "⌘",
    shift: "⇧",
    alt: "⌥",
    ctrl: "⌃",
    enter: "↩",
    esc: "esc",
    backspace: "⌫",
  };
  return (
    <Kbd className={cn("h-[18px] min-w-0 gap-0.5 px-1 font-sans text-[10.5px]", className)}>
      {keys.split("+").map((k) => (
        <span key={k}>{glyph[k] ?? k.toUpperCase()}</span>
      ))}
    </Kbd>
  );
}

interface IconButtonProps extends ComponentProps<typeof Button> {
  label: string;
  shortcut?: string;
  side?: "top" | "bottom" | "left" | "right";
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, shortcut, side = "bottom", className, children, ...props },
  ref,
) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          ref={ref}
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          className={cn("text-muted-foreground hover:text-foreground", className)}
          {...props}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side={side} className="flex items-center gap-2">
        {label}
        {shortcut && <Shortcut keys={shortcut} className="bg-background/20 text-current" />}
      </TooltipContent>
    </Tooltip>
  );
});

/** Window toolbar. Doubles as the drag region for moving the window. */
export function Toolbar({
  title,
  subtitle,
  leading,
  children,
  className,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  leading?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <header
      data-tauri-drag-region
      className={cn(
        "flex h-[52px] shrink-0 items-center gap-2 border-b border-hairline pr-3 pl-[var(--toolbar-inset,16px)] transition-[padding] duration-300 ease-[var(--ease-mac)]",
        className,
      )}
    >
      {leading}
      {title && (
        <div data-tauri-drag-region className="flex min-w-0 flex-1 flex-col justify-center">
          <h1
            data-tauri-drag-region
            className="truncate font-heading text-[13.5px] leading-tight font-semibold tracking-[-0.01em]"
          >
            {title}
          </h1>
          {subtitle && (
            <p data-tauri-drag-region className="truncate text-[11px] leading-tight text-muted-foreground">
              {subtitle}
            </p>
          )}
        </div>
      )}
      {!title && <div data-tauri-drag-region className="flex-1 self-stretch" />}
      {children && <div className="flex items-center gap-1">{children}</div>}
    </header>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  children,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
      className={cn("flex flex-col items-center justify-center px-6 py-16 text-center", className)}
    >
      <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-gradient-to-b from-muted to-secondary text-muted-foreground shadow-[var(--shadow-window)]">
        <Icon className="size-5" />
      </div>
      <h3 className="font-heading text-[15px] font-semibold tracking-[-0.01em]">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-sm text-[12.5px] leading-relaxed text-balance text-muted-foreground">
          {description}
        </p>
      )}
      {children && <div className="mt-5 flex items-center gap-2">{children}</div>}
    </motion.div>
  );
}

export function ErrorBanner({
  message,
  onDismiss,
  action,
  className,
}: {
  message: string;
  onDismiss?: () => void;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      role="alert"
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      className={cn(
        "flex items-start gap-2.5 rounded-xl border border-destructive/25 bg-destructive/8 px-3 py-2.5 text-[12.5px]",
        className,
      )}
    >
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-destructive" />
      <p className="selectable flex-1 leading-relaxed">{message}</p>
      {action}
      {onDismiss && (
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          className="rounded p-0.5 text-muted-foreground hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      )}
    </motion.div>
  );
}

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  layoutId,
  className,
  "aria-label": ariaLabel,
}: {
  value: T;
  options: SegmentOption<T>[];
  onChange: (value: T) => void;
  layoutId: string;
  className?: string;
  "aria-label": string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn("inline-flex rounded-lg bg-muted p-0.5 shadow-inner shadow-black/[0.03]", className)}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              "relative flex h-6 items-center gap-1.5 rounded-md px-2.5 text-[12px] font-medium transition-colors",
              active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                transition={{ type: "spring", bounce: 0.15, duration: 0.35 }}
                className="absolute inset-0 rounded-md bg-surface-raised shadow-[var(--shadow-window)]"
              />
            )}
            {opt.icon && <opt.icon className="relative size-3.5" />}
            <span className="relative">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export const SearchField = forwardRef<
  HTMLInputElement,
  { value: string; onChange: (v: string) => void; placeholder: string; className?: string }
>(function SearchField({ value, onChange, placeholder, className }, ref) {
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <input
        ref={ref}
        data-search-field
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && value) {
            e.stopPropagation();
            onChange("");
          }
        }}
        placeholder={placeholder}
        spellCheck={false}
        className="h-7 w-full rounded-md border border-transparent bg-muted pr-2 pl-7 text-[12.5px] transition-colors outline-none placeholder:text-muted-foreground/80 focus:border-ring focus:bg-background focus:ring-3 focus:ring-ring/25 [&::-webkit-search-cancel-button]:hidden"
      />
    </div>
  );
});

const PROJECT_DOT: Record<ProjectColor, string> = {
  blue: "bg-[oklch(0.62_0.17_252)]",
  violet: "bg-[oklch(0.6_0.2_292)]",
  pink: "bg-[oklch(0.66_0.2_355)]",
  orange: "bg-[oklch(0.72_0.17_55)]",
  green: "bg-[oklch(0.68_0.16_150)]",
  teal: "bg-[oklch(0.68_0.11_195)]",
  gray: "bg-[oklch(0.62_0.01_260)]",
};

export function ProjectDot({ color, className }: { color: ProjectColor; className?: string }) {
  return <span className={cn("inline-block size-2 shrink-0 rounded-full", PROJECT_DOT[color], className)} />;
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn(
        "inline-block size-3.5 animate-spin rounded-full border-[1.5px] border-current border-r-transparent opacity-70",
        className,
      )}
    />
  );
}
