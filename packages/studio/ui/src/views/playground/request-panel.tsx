import { ChevronDown, Code2, Copy, KeyRound, Link, Terminal } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { FormBodyField } from "@/features/playground/form-body";
import { endpointUrl, snippetInput } from "@/features/playground/request-snippet";
import { readRequestValues } from "@/features/playground/request-values";
import { copyToClipboard } from "@/lib/clipboard";
import { buildCurlSnippet, buildFetchSnippet, type SnippetInput } from "@/lib/snippets";
import { cn } from "@/lib/utils";
import type { EndpointInfo, SourceInfo } from "@/store/types-ui";
import { PathDisplay } from "@/views/explorer/shared/path-display";
import { type BodyKind, BodySection } from "./body-section";
import { JsonEditor } from "./json-editor";

// ── Types ──────────────────────────────────────────────────────────────────

interface RequestPanelProps {
  variables: string;
  headers: string;
  endpointInfo: EndpointInfo | null;
  sourceInfo: SourceInfo | null;
  groupPrefix: string;
  onVariablesChange: (v: string) => void;
  onHeadersChange: (h: string) => void;
  /** The body's kind and its form rows, when it is a form */
  body: {
    kind: BodyKind;
    formFields: FormBodyField[];
    onKindChange: (kind: BodyKind) => void;
    onFormFieldsChange: (fields: FormBodyField[]) => void;
  };
}

// ── Component ──────────────────────────────────────────────────────────────

export function RequestPanel({
  variables,
  headers,
  endpointInfo,
  sourceInfo,
  groupPrefix,
  onVariablesChange,
  onHeadersChange,
  body,
}: RequestPanelProps): React.ReactElement {
  const [headersOpen, setHeadersOpen] = useState(false);
  const fullPath = endpointUrl(sourceInfo, groupPrefix, endpointInfo);

  const buildSnippetInput = useCallback((): SnippetInput | null => {
    const request = readRequestValues(variables, headers);
    if (!request.ok) {
      toast.error(request.problem);
      return null;
    }
    return endpointInfo ? snippetInput(fullPath, endpointInfo, request.values) : null;
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

      <BodySection
        kind={body.kind}
        formAllowed={!endpointInfo?.transport}
        variables={variables}
        formFields={body.formFields}
        schemaHint={endpointInfo?.hasVariablesSchema ? "Schema validated" : undefined}
        onKindChange={body.onKindChange}
        onVariablesChange={onVariablesChange}
        onFormFieldsChange={body.onFormFieldsChange}
      />

      {/* Headers — collapsible */}
      <Collapsible open={headersOpen} onOpenChange={setHeadersOpen} className="mt-2">
        <CollapsibleTrigger className="flex w-full items-center gap-1.5 py-1">
          <ChevronDown
            className={cn(
              "size-3 text-muted-foreground transition-transform",
              headersOpen && "rotate-0",
              !headersOpen && "-rotate-90",
            )}
          />
          <EditorLabel icon={KeyRound} label="Headers" />
          {headers.trim() !== "{}" && (
            <span className="text-[10px] text-accent-brand/60">modified</span>
          )}
        </CollapsibleTrigger>
        <CollapsibleContent>
          <JsonEditor
            value={headers}
            onChange={onHeadersChange}
            placeholder='{ "Authorization": "Bearer ..." }'
            className="mt-1.5 h-28"
          />
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

// ── Copy menu ──────────────────────────────────────────────────────────────

function CopyMenu({ buildInput }: { buildInput: () => SnippetInput | null }): React.ReactElement {
  const [open, setOpen] = useState(false);

  const copy = (format: (input: SnippetInput) => string, label: string) => () => {
    setOpen(false);
    const input = buildInput();
    if (input) void copyToClipboard(format(input), label);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Copy as"
              className="size-5 shrink-0 text-muted-foreground/40 hover:text-foreground"
            >
              <Copy className="size-3" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="left">Copy as...</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" side="bottom" className="w-auto p-1">
        <div className="flex flex-col">
          <CopyRow icon={Link} label="URL" onClick={copy((input) => input.url, "URL")} />
          <CopyRow icon={Terminal} label="cURL" onClick={copy(buildCurlSnippet, "cURL")} />
          <CopyRow icon={Code2} label="fetch" onClick={copy(buildFetchSnippet, "fetch")} />
        </div>
      </PopoverContent>
    </Popover>
  );
}

function CopyRow({
  icon: Icon,
  label,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 rounded px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
    >
      <Icon className="size-3" />
      {label}
    </button>
  );
}

// ── Subcomponents ──────────────────────────────────────────────────────────

function EditorLabel({
  icon: Icon,
  label,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  hint?: string;
}): React.ReactElement {
  return (
    <div className="flex items-center gap-1.5">
      <Icon className="size-3 text-muted-foreground" />
      <span className="text-caption text-muted-foreground">{label}</span>
      {hint && <span className="text-[10px] text-emerald-400/70">{hint}</span>}
    </div>
  );
}
