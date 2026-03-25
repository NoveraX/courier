import { CopyButton } from "@/components/shared/copy-button";

// ── HeadersSection (shared — used by Playground + Timeline) ─────────────────

interface HeadersSectionProps {
  title: string;
  headers?: Record<string, string>;
  warning?: string;
}

export function HeadersSection({ title, headers, warning }: HeadersSectionProps): React.ReactElement | null {
  const entries = headers ? Object.entries(headers).sort(([a], [b]) => a.localeCompare(b)) : [];
  if (entries.length === 0) return null;

  const serialized = entries.map(([k, v]) => `${k}: ${v}`).join("\n");

  return (
    <div className="overflow-hidden rounded-lg border border-border-subtle bg-background-inset">
      <div className="flex shrink-0 items-center gap-2 border-b border-border-subtle px-3 py-1.5">
        <span className="rounded bg-card/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
          {title} ({entries.length})
        </span>
        <div className="flex-1" />
        <CopyButton value={serialized} label={`Copy ${title.toLowerCase()}`} />
      </div>
      {warning && (
        <div className="border-b border-border-subtle px-3 py-1.5 text-[10px] text-amber-400/70">
          {warning}
        </div>
      )}
      <div className="p-2">
        {entries.map(([key, value]) => (
          <div key={key} className="flex items-baseline gap-3 rounded px-2 py-1">
            <span className="w-44 shrink-0 truncate font-mono text-[11px] font-medium text-violet-400/90">
              {key}
            </span>
            <span className="min-w-0 flex-1 break-all font-mono text-[11px] text-foreground/60">
              {value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── DroppedHeadersSection (headers filtered out by allowedHeaders) ───────────

export function DroppedHeadersSection({ sent, forwarded }: {
  sent: string;
  forwarded?: Record<string, string>;
}): React.ReactElement | null {
  let parsed: Record<string, string>;
  try { parsed = JSON.parse(sent); } catch { return null; }
  if (!parsed || typeof parsed !== "object") return null;

  const forwardedLower = new Set(
    Object.keys(forwarded ?? {}).map((k) => k.toLowerCase()),
  );

  const dropped: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed)) {
    if (!forwardedLower.has(k.toLowerCase())) {
      dropped[k] = v;
    }
  }

  if (Object.keys(dropped).length === 0) return null;

  return (
    <HeadersSection
      title="Dropped Headers"
      headers={dropped}
      warning="Not in allowedHeaders — add to defineApi({ allowedHeaders: [...] })"
    />
  );
}
