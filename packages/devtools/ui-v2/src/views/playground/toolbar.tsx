import { Play, Loader2, Zap, Globe } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SingleSelect } from "@/components/shared/single-select";
import { TypeBadge } from "@/components/shared/type-badge";
import { KbdHint } from "@/components/shared/kbd-hint";
import { cn } from "@/lib/utils";

import type { EndpointInfo } from "@/store/types-ui";

// ── Types ──────────────────────────────────────────────────────────────────

interface ToolbarProps {
  sources: string[];
  groups: string[];
  methods: string[];
  source: string;
  group: string;
  method: string;
  mode: "direct" | "proxy";
  endpointInfo: EndpointInfo | null;
  sending: boolean;
  canSend: boolean;
  onSourceChange: (s: string) => void;
  onGroupChange: (g: string) => void;
  onMethodChange: (m: string) => void;
  onModeChange: (m: "direct" | "proxy") => void;
  onSend: () => void;
  historySlot?: React.ReactNode;
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Sentinel for flat endpoints group ("" is problematic with cmdk) */
const FLAT_KEY = "__flat__";

function toOptions(keys: string[]) {
  return keys.map((k) => ({ value: k, label: k }));
}

/** Map group keys: "" → sentinel for cmdk compatibility */
function toGroupOptions(keys: string[]) {
  return keys.map((k) =>
    k === "" ? { value: FLAT_KEY, label: "(endpoints)" } : { value: k, label: k },
  );
}

function groupToUi(group: string): string {
  return group === "" ? FLAT_KEY : group;
}

function uiToGroup(value: string): string {
  return value === FLAT_KEY ? "" : value;
}

// ── Component ──────────────────────────────────────────────────────────────

export function PlaygroundToolbar({
  sources, groups, methods,
  source, group, method, mode,
  endpointInfo, sending, canSend,
  onSourceChange, onGroupChange, onMethodChange,
  onModeChange, onSend, historySlot,
}: ToolbarProps): React.ReactElement {
  const groupOptions = toGroupOptions(groups);
  const showGroups = groups.length > 1 || (groups.length === 1 && groups[0] !== "");

  return (
    <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border-subtle px-3">
      {/* Endpoint selectors */}
      <div className="flex items-center gap-1">
        <SingleSelect options={toOptions(sources)} value={source} onChange={onSourceChange} />
        {showGroups && (
          <>
            <span className="text-muted-foreground/40">/</span>
            <SingleSelect
              options={groupOptions}
              value={groupToUi(group)}
              onChange={(v) => onGroupChange(uiToGroup(v))}
            />
          </>
        )}
        <span className="text-muted-foreground/40">/</span>
        <SingleSelect options={toOptions(methods)} value={method} onChange={onMethodChange} />
      </div>

      {/* Endpoint type badge */}
      {endpointInfo && (
        <TypeBadge type={endpointInfo.type ?? "untyped"} />
      )}

      <div className="flex-1" />

      {/* Mode toggle */}
      <ModeToggle mode={mode} onChange={onModeChange} />

      {/* History dropdown */}
      {historySlot}

      {/* Send button */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="sm"
            className="h-7 gap-1.5 bg-accent-brand px-3 text-xs font-medium text-white hover:bg-accent-brand/90"
            disabled={!canSend || sending}
            onClick={onSend}
          >
            {sending ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Play className="size-3" />
            )}
            Send
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <span className="flex items-center gap-1.5">Send request <KbdHint keys="mod+enter" /></span>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

// ── Mode Toggle ─────────────────────────────────────────────────────────

const MODE_OPTIONS = [
  { value: "direct" as const, label: "Direct", icon: Zap },
  { value: "proxy" as const, label: "Proxy", icon: Globe },
];

function ModeToggle({
  mode,
  onChange,
}: {
  mode: "direct" | "proxy";
  onChange: (m: "direct" | "proxy") => void;
}): React.ReactElement {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="inline-flex items-center gap-px rounded-lg border border-border-subtle bg-muted/60 p-0.5">
          {MODE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={cn(
                "flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-all",
                mode === opt.value
                  ? "bg-background text-foreground shadow-sm ring-1 ring-border-subtle"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/50",
              )}
            >
              <opt.icon className="size-3" />
              {opt.label}
            </button>
          ))}
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {mode === "direct" ? "Execute directly on server" : "Route through proxy endpoint"}
      </TooltipContent>
    </Tooltip>
  );
}
