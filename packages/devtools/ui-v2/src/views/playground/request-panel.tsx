import { useState, useCallback } from "react";
import { FileJson, KeyRound, ChevronDown, Terminal, Code2, Copy, Link } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { PathDisplay } from "@/views/explorer/shared/path-display";
import { buildCurlSnippet, buildFetchSnippet, resolvePathParams } from "@/lib/snippets";

import type { EndpointInfo, SourceInfo } from "@/store/types-ui";
import { JsonEditor, stripComments } from "./json-editor";

// ── Types ──────────────────────────────────────────────────────────────────

interface RequestPanelProps {
  variables: string;
  headers: string;
  endpointInfo: EndpointInfo | null;
  sourceInfo: SourceInfo | null;
  groupPrefix: string;
  onVariablesChange: (v: string) => void;
  onHeadersChange: (h: string) => void;
}

// ── Component ──────────────────────────────────────────────────────────────

export function RequestPanel({
  variables, headers, endpointInfo, sourceInfo, groupPrefix,
  onVariablesChange, onHeadersChange,
}: RequestPanelProps): React.ReactElement {
  const [headersOpen, setHeadersOpen] = useState(false);
  const fullPath = buildFullPath(sourceInfo?.baseURL, groupPrefix, endpointInfo?.path);

  const buildSnippetInput = useCallback(() => {
    const parsedVars = safeParse(variables);
    return {
      url: fullPath ? resolvePathParams(fullPath, parsedVars) : "",
      method: endpointInfo?.type === "mutation" ? "POST" : "GET",
      headers: { "Content-Type": "application/json", ...safeParse(headers) },
      body: parsedVars,
    };
  }, [fullPath, variables, headers, endpointInfo]);

  return (
    <div className="flex h-full flex-col overflow-auto p-3">
      {/* Endpoint path + copy menu */}
      {fullPath && (
        <div className="mb-2 flex items-center gap-1.5 rounded-md border border-border-subtle bg-card/30 px-2.5 py-1.5">
          <span className="text-caption text-muted-foreground/50">URL</span>
          <PathDisplay path={fullPath} className="flex-1 text-[11px]" />
          <CopyMenu buildInput={buildSnippetInput} />
        </div>
      )}

      {/* Variables editor */}
      <div className="flex min-h-0 flex-1 flex-col gap-1.5">
        <EditorLabel icon={FileJson} label="Variables" hint={endpointInfo?.hasVariablesSchema ? "Schema validated" : undefined} />
        <JsonEditor value={variables} onChange={onVariablesChange} placeholder='{ "id": 1 }' className="min-h-0 flex-1" />
      </div>

      {/* Headers — collapsible */}
      <Collapsible open={headersOpen} onOpenChange={setHeadersOpen} className="mt-2">
        <CollapsibleTrigger className="flex w-full items-center gap-1.5 py-1">
          <ChevronDown className={cn("size-3 text-muted-foreground transition-transform", headersOpen && "rotate-0", !headersOpen && "-rotate-90")} />
          <EditorLabel icon={KeyRound} label="Headers" />
          {headers.trim() !== "{}" && <span className="text-[10px] text-accent-brand/60">modified</span>}
        </CollapsibleTrigger>
        <CollapsibleContent>
          <JsonEditor value={headers} onChange={onHeadersChange} placeholder='{ "Authorization": "Bearer ..." }' className="mt-1.5 h-28" />
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

// ── Copy menu ──────────────────────────────────────────────────────────────

function CopyMenu({ buildInput }: {
  buildInput: () => { url: string; method: string; headers: Record<string, string>; body: unknown };
}): React.ReactElement {
  const [open, setOpen] = useState(false);

  const copy = (fn: () => string, label: string) => () => {
    navigator.clipboard.writeText(fn());
    toast.success(`${label} copied`);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="size-5 shrink-0 text-muted-foreground/40 hover:text-foreground">
              <Copy className="size-3" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="left">Copy as...</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" side="bottom" className="w-auto p-1">
        <div className="flex flex-col">
          <CopyRow icon={Link} label="URL" onClick={copy(() => buildInput().url, "URL")} />
          <CopyRow icon={Terminal} label="cURL" onClick={copy(() => buildCurlSnippet(buildInput()), "cURL")} />
          <CopyRow icon={Code2} label="fetch" onClick={copy(() => buildFetchSnippet(buildInput()), "fetch")} />
        </div>
      </PopoverContent>
    </Popover>
  );
}

function CopyRow({ icon: Icon, label, onClick }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
}): React.ReactElement {
  return (
    <button type="button" onClick={onClick} className="flex items-center gap-2 rounded px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-card hover:text-foreground">
      <Icon className="size-3" />
      {label}
    </button>
  );
}

// ── Subcomponents ──────────────────────────────────────────────────────────

function EditorLabel({ icon: Icon, label, hint }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  hint?: string;
}): React.ReactElement {
  return (
    <div className="flex items-center gap-1.5">
      <Icon className="size-3.5 text-muted-foreground" />
      <span className="text-caption text-muted-foreground">{label}</span>
      {hint && <span className="text-[10px] text-emerald-400/70">{hint}</span>}
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

export function buildFullPath(baseURL?: string, prefix?: string, path?: string): string {
  const parts = [baseURL, prefix, path].filter(Boolean);
  if (parts.length === 0) return "";
  return parts.reduce((acc, part) => {
    if (!acc) return part!;
    const a = acc.endsWith("/") ? acc.slice(0, -1) : acc;
    const b = part!.startsWith("/") ? part! : `/${part}`;
    return a + b;
  }, "")!;
}

function safeParse(json: string): Record<string, string> {
  try { return JSON.parse(stripComments(json)); } catch { return {}; }
}
