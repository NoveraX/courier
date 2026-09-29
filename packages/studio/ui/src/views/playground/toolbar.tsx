import { Loader2, Play, Radio, Square, Wifi } from "lucide-react";

import { KbdHint } from "@/components/shared/kbd-hint";
import { SingleSelect } from "@/components/shared/single-select";
import { TypeBadge } from "@/components/shared/type-badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

import type { CatalogEntry, EndpointInfo } from "@/store/types-ui";
import { ModeToggle } from "./mode-toggle";
import { ProxyPathBadge } from "./proxy-path-badge";
import { TransportBadge } from "./transport-badge";

// ── Types ──────────────────────────────────────────────────────────────────

interface ToolbarProps {
  sources: string[];
  groups: string[];
  methods: string[];
  source: string;
  group: string;
  method: string;
  mode: "direct" | "proxy";
  sourceInfo: CatalogEntry | null;
  endpointInfo: EndpointInfo | null;
  sending: boolean;
  canSend: boolean;
  streaming: boolean;
  onSourceChange: (s: string) => void;
  onGroupChange: (g: string) => void;
  onMethodChange: (m: string) => void;
  onModeChange: (m: "direct" | "proxy") => void;
  onSend: () => void;
  onUnsubscribe?: () => void;
  historySlot?: React.ReactNode;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const FLAT_KEY = "__flat__";

function toOptions(keys: string[]) {
  return keys.map((k) => ({ value: k, label: k }));
}

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
  sources,
  groups,
  methods,
  source,
  group,
  method,
  mode,
  sourceInfo,
  endpointInfo,
  sending,
  canSend,
  streaming,
  onSourceChange,
  onGroupChange,
  onMethodChange,
  onModeChange,
  onSend,
  onUnsubscribe,
  historySlot,
}: ToolbarProps): React.ReactElement {
  const isRealtime = endpointInfo?.transport === "sse" || endpointInfo?.transport === "ws";
  const groupOptions = toGroupOptions(groups);
  const showGroups = groups.length > 1 || (groups.length === 1 && groups[0] !== "");
  // HTTP endpoints have no `transport` field — fall back to "http" so the
  // badge surfaces `proxyPath.http` for plain query/mutation calls in proxy
  // mode, not just realtime streams.
  const proxyTransport: "http" | "sse" | "ws" = endpointInfo?.transport ?? "http";
  const showProxyPath = mode === "proxy" && !!endpointInfo;

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

      {/* Endpoint type + transport badge */}
      {endpointInfo && (
        <>
          {!isRealtime && <TypeBadge type={endpointInfo.type ?? "untyped"} />}
          {isRealtime && endpointInfo.transport && (
            <TransportBadge transport={endpointInfo.transport} />
          )}
        </>
      )}

      <div className="flex-1" />

      {/* Read-only proxy path badge — surfaces the configured proxy URL
          for the current endpoint in proxy mode (HTTP, SSE, or WS).
          Sits to the LEFT of the mode toggle so the URL is read first as
          context for which endpoint the toggle is switching against. */}
      {showProxyPath && <ProxyPathBadge transport={proxyTransport} source={sourceInfo} />}

      {/* Mode toggle */}
      <ModeToggle mode={mode} onChange={onModeChange} />

      {/* History dropdown */}
      {historySlot}

      {/* Send / Subscribe / Unsubscribe button */}
      {streaming ? (
        <Button
          size="sm"
          className="h-7 gap-1.5 bg-rose-600 px-3 text-xs font-medium text-white hover:bg-rose-700"
          onClick={onUnsubscribe}
        >
          <Square className="size-3" />
          Unsubscribe
        </Button>
      ) : (
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
              ) : endpointInfo?.transport === "ws" ? (
                <Wifi className="size-3" />
              ) : isRealtime ? (
                <Radio className="size-3" />
              ) : (
                <Play className="size-3" />
              )}
              {isRealtime ? "Subscribe" : "Send"}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <span className="flex items-center gap-1.5">
              {isRealtime ? "Subscribe to stream" : "Send request"} <KbdHint keys="mod+enter" />
            </span>
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
