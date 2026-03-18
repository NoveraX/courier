import { Braces, Code2, Terminal } from "lucide-react";
import { useMemo, useState } from "react";

import { ScrollArea } from "@/components/ui/scroll-area";
import { CopyButton } from "@/components/shared/copy-button";
import { CodeBlock, FormatSwitcher } from "@/components/shared/code-block";
import type { RequestEntry } from "@/store/types";
import {
  buildCurl,
  buildFetchSnippet,
  buildRequestJson,
} from "../request-helpers";

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
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
              Snippet
            </h4>
            <FormatSwitcher
              formats={FORMATS as unknown as { key: string; label: string; icon: React.ComponentType<{ className?: string }> }[]}
              active={format}
              onChange={(k) => setFormat(k as Format)}
            />
          </div>
          <CodeBlock code={snippet} language={format} />
        </div>
        <QuickCopySection request={request} />
      </div>
    </ScrollArea>
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
