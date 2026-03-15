import { Braces, Code2, Terminal } from "lucide-react";
import { useMemo, useState } from "react";

import { CopyButton } from "@/components/shared/copy-button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { RequestEntry } from "@/store/types";
import {
  buildCurl,
  buildFetchSnippet,
  buildRequestJson,
} from "../request-helpers";
import { highlightLine } from "./syntax-highlight";

const FORMATS = [
  { key: "curl", label: "cURL", icon: Terminal },
  { key: "fetch", label: "fetch", icon: Code2 },
  { key: "json", label: "JSON", icon: Braces },
] as const;

type Format = (typeof FORMATS)[number]["key"];

interface SnippetsTabProps {
  request: RequestEntry;
}

export function SnippetsTab({ request }: SnippetsTabProps): React.ReactElement {
  const [format, setFormat] = useState<Format>("curl");

  const snippet = useMemo(() => {
    switch (format) {
      case "curl": return buildCurl(request);
      case "fetch": return buildFetchSnippet(request);
      case "json": return buildRequestJson(request);
    }
  }, [format, request]);

  return (
    <ScrollArea className="h-full">
      <div className="space-y-5 p-4">
        <SnippetSection format={format} snippet={snippet} onFormatChange={setFormat} />
        <QuickCopySection request={request} />
      </div>
    </ScrollArea>
  );
}

// ── Snippet section ───────────────────────────────────────────────────────

function SnippetSection({ format, snippet, onFormatChange }: {
  format: Format;
  snippet: string;
  onFormatChange: (f: Format) => void;
}): React.ReactElement {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
          Snippet
        </h4>
        <div className="inline-flex items-center gap-0.5 rounded-lg bg-muted/50 p-0.5">
          {FORMATS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => onFormatChange(f.key)}
              className={cn(
                "flex items-center gap-1 rounded-md px-2 py-1 text-[14px] font-medium transition-colors",
                format === f.key
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <f.icon className="size-3" />
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <CodeBlock code={snippet} language={format} />
    </div>
  );
}

// ── Code block with line numbers + syntax highlighting ────────────────────

function CodeBlock({ code, language }: {
  code: string;
  language: string;
}): React.ReactElement {
  const lines = code.split("\n");
  const gutterW = `${String(lines.length).length}ch`;

  return (
    <div className="relative overflow-hidden rounded-lg border border-border-subtle bg-background-inset">
      <div className="absolute right-2 top-2 z-10">
        <CopyButton value={code} label={`Copy ${language}`} />
      </div>
      <div className="max-h-72 overflow-auto py-3">
        {lines.map((line, i) => (
          <div key={i} className="flex px-3">
            <span
              className="mr-3 shrink-0 select-none text-right text-[10px] tabular-nums leading-relaxed text-muted-foreground/25"
              style={{ minWidth: gutterW }}
            >
              {i + 1}
            </span>
            <span className="min-w-0 flex-1 mono-sm whitespace-pre-wrap break-all leading-relaxed text-foreground/70">
              {highlightLine(line, language)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Quick copy section ────────────────────────────────────────────────────

function QuickCopySection({ request }: { request: RequestEntry }): React.ReactElement {
  const endpoint = [request.source, request.group, request.method]
    .filter(Boolean)
    .join(".");

  return (
    <div>
      <h4 className="mb-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
        Quick Copy
      </h4>
      <div className="overflow-hidden rounded-lg border border-border-subtle">
        {request.url && <QuickCopyRow label="URL" value={request.url} />}
        <QuickCopyRow label="Endpoint" value={endpoint} />
        <QuickCopyRow label="Request ID" value={request.id} />
      </div>
    </div>
  );
}

function QuickCopyRow({ label, value }: {
  label: string;
  value: string;
}): React.ReactElement {
  return (
    <div className="flex items-center gap-3 border-b border-border-subtle px-3 py-2 last:border-b-0">
      <span className="w-20 shrink-0 text-body-sm text-muted-foreground">{label}</span>
      <code className="min-w-0 flex-1 truncate mono-sm text-foreground/80">{value}</code>
      <CopyButton value={value} label={`Copy ${label.toLowerCase()}`} />
    </div>
  );
}
