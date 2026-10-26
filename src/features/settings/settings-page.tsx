import { useEffect, useState, type ReactNode } from "react";
import { Check, Cloud, FolderOpen, HardDrive, KeyRound, Laptop, Moon, ShieldCheck, Sun, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SegmentedControl, Toolbar } from "@/components/common/primitives";
import { chatStore, services, settingsStore, useChat, useSettings } from "@/app/stores";
import { cn } from "@/lib/utils";
import type { ProviderInfo } from "@/services/ai/types";
import type { AppInfo } from "@/types/domain";
import { ConfirmDialog } from "@/features/chat/conversation-dialogs";
import { ACCENTS, type AccentColor, type ThemePreference } from "./settings-model";
import { plural } from "@/lib/plural";

const ACCENT_SWATCH: Record<AccentColor, string> = {
  blue: "oklch(0.6 0.19 252)",
  violet: "oklch(0.6 0.19 292)",
  teal: "oklch(0.62 0.12 190)",
  amber: "oklch(0.72 0.16 62)",
  graphite: "oklch(0.55 0.01 260)",
};

function Group({ title, footer, children }: { title: string; footer?: ReactNode; children: ReactNode }) {
  return (
    <section className="mb-7">
      <h2 className="mb-1.5 px-1 text-[12px] font-semibold text-muted-foreground">{title}</h2>
      <div className="divide-y divide-hairline overflow-hidden rounded-xl border border-border bg-surface-raised shadow-[var(--shadow-window)]">
        {children}
      </div>
      {footer && <p className="mt-1.5 px-1 text-[11.5px] leading-relaxed text-muted-foreground">{footer}</p>}
    </section>
  );
}

function Row({
  label,
  description,
  htmlFor,
  children,
}: {
  label: ReactNode;
  description?: ReactNode;
  htmlFor?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex min-h-11 items-center gap-4 px-4 py-2.5">
      <div className="min-w-0 flex-1">
        <label htmlFor={htmlFor} className="block text-[13px]">
          {label}
        </label>
        {description && <p className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">{description}</p>}
      </div>
      {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
    </div>
  );
}

export function SettingsPage() {
  const settings = useSettings((s) => s.settings);
  const error = useSettings((s) => s.error);
  const conversationCount = useChat((s) => s.conversations.length);
  const update = settingsStore.getState().update;
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    services.ai.listProviders().then(setProviders, () => setProviders([]));
    services.system.info().then(setInfo, () => setInfo(null));
  }, []);

  useEffect(() => {
    if (error) toast.error("Couldn't save settings", { description: error });
  }, [error]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Toolbar title="Settings" />
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[620px] px-6 py-6">
          <Group title="Appearance">
            <Row label="Theme" description="Match macOS or choose a fixed appearance.">
              <SegmentedControl<ThemePreference>
                aria-label="Theme"
                layoutId="theme-segment"
                value={settings.theme}
                onChange={(theme) => void update({ theme })}
                options={[
                  { value: "system", label: "Auto", icon: Laptop },
                  { value: "light", label: "Light", icon: Sun },
                  { value: "dark", label: "Dark", icon: Moon },
                ]}
              />
            </Row>
            <Row label="Accent color">
              <div className="flex gap-2" role="radiogroup" aria-label="Accent color">
                {ACCENTS.map((accent) => (
                  <button
                    key={accent}
                    role="radio"
                    aria-checked={settings.accent === accent}
                    aria-label={accent}
                    onClick={() => void update({ accent })}
                    style={{ background: ACCENT_SWATCH[accent] }}
                    className={cn(
                      "flex size-5 items-center justify-center rounded-full shadow-inner ring-offset-2 ring-offset-surface-raised transition-transform hover:scale-110",
                      settings.accent === accent && "ring-2 ring-foreground/25",
                    )}
                  >
                    {settings.accent === accent && <Check className="size-3 text-white" strokeWidth={3} />}
                  </button>
                ))}
              </div>
            </Row>
            <Row
              label="Reduce motion"
              htmlFor="reduce-motion"
              description="Minimize animations. macOS accessibility settings are always respected."
            >
              <Switch
                id="reduce-motion"
                checked={settings.reduceMotion}
                onCheckedChange={(reduceMotion) => void update({ reduceMotion })}
              />
            </Row>
            <Row label="Show sidebar" htmlFor="show-sidebar" description="Toggle anytime with ⌘\.">
              <Switch
                id="show-sidebar"
                checked={!settings.sidebarCollapsed}
                onCheckedChange={(on) => void update({ sidebarCollapsed: !on })}
              />
            </Row>
          </Group>

          <Group title="Chat">
            <Row
              label="Send with Return"
              htmlFor="send-on-enter"
              description={settings.sendOnEnter ? "Shift-Return inserts a new line." : "Press ⌘-Return to send."}
            >
              <Switch
                id="send-on-enter"
                checked={settings.sendOnEnter}
                onCheckedChange={(sendOnEnter) => void update({ sendOnEnter })}
              />
            </Row>
            <Row label="Default model" description="Used for new replies.">
              <Select
                value={settings.defaultProviderId}
                onValueChange={(defaultProviderId) => void update({ defaultProviderId })}
              >
                <SelectTrigger size="sm" className="w-44">
                  <SelectValue placeholder="Choose a model" />
                </SelectTrigger>
                <SelectContent align="end">
                  {providers.map((p) => (
                    <SelectItem key={p.id} value={p.id} disabled={p.status !== "ready"}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Row>
          </Group>

          <Group
            title="AI Connection"
            footer="Cloud providers connect through the app's secure native layer. API keys will be stored in the macOS Keychain and are never exposed to the interface."
          >
            {providers.map((p) => (
              <Row
                key={p.id}
                label={
                  <span className="flex items-center gap-2">
                    {p.isLocal ? <HardDrive className="size-3.5 text-muted-foreground" /> : <Cloud className="size-3.5" />}
                    {p.name}
                    <span className="rounded bg-muted px-1 py-px font-mono text-[10.5px] text-muted-foreground">{p.model}</span>
                  </span>
                }
                description={p.description}
              >
                <StatusPill ready={p.status === "ready"} />
              </Row>
            ))}
            <Row
              label={
                <span className="flex items-center gap-2 text-muted-foreground">
                  <KeyRound className="size-3.5" /> OpenAI
                </span>
              }
              description="Responses API with streaming. Available in the next release."
            >
              <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                Coming soon
              </span>
            </Row>
          </Group>

          <Group
            title="Privacy & Data"
            footer={
              <span className="flex items-start gap-1.5">
                <ShieldCheck className="mt-px size-3.5 shrink-0 text-success" />
                Conversations, projects, and library metadata are stored only on this Mac. The Local Preview model
                never sends data over the network.
              </span>
            }
          >
            <Row
              label="Data location"
              description={<span className="selectable font-mono text-[11px] break-all">{info?.dataDir ?? "—"}</span>}
            >
              <Button
                size="sm"
                variant="outline"
                disabled={services.runtime === "browser"}
                onClick={() => void services.system.revealDataDir().catch((e) => toast.error(String(e?.message ?? e)))}
              >
                <FolderOpen /> Show in Finder
              </Button>
            </Row>
            <Row label="Conversation history" description={plural(conversationCount, "saved conversation")}>
              <Button
                size="sm"
                variant="destructive"
                disabled={conversationCount === 0}
                onClick={() => setClearing(true)}
              >
                <Trash2 /> Clear All…
              </Button>
            </Row>
          </Group>

          <Group title="About">
            <Row label="AI Workspace" description={info ? `Version ${info.version}` : undefined}>
              <span className="text-[11.5px] text-muted-foreground">
                {services.runtime === "desktop" ? "Native app" : "Browser preview"}
              </span>
            </Row>
          </Group>
        </div>
      </div>

      <ConfirmDialog
        open={clearing}
        onOpenChange={setClearing}
        title="Clear all conversations?"
        description={`This permanently deletes ${plural(conversationCount, "conversation")} and their messages from this Mac. Projects and library documents are kept.`}
        confirmLabel="Clear All"
        onConfirm={async () => {
          const removed = await chatStore.getState().removeAll();
          toast.success(`Deleted ${plural(removed, "conversation")}`);
        }}
      />
    </div>
  );
}

function StatusPill({ ready }: { ready: boolean }) {
  return (
    <span
      className={cn(
        "flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium",
        ready ? "bg-success/12 text-success" : "bg-warning/15 text-warning",
      )}
    >
      <span className={cn("size-1.5 rounded-full", ready ? "bg-success" : "bg-warning")} />
      {ready ? "Ready" : "Needs setup"}
    </span>
  );
}
