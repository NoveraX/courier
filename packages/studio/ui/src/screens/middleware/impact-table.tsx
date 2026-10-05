import { methodText } from "@/design/method-color";
import type { EndpointImpact } from "@/features/middleware/endpoint-impact";
import { formatDuration } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { MiddlewareLook } from "./middleware-look";

/* From this share of an endpoint's time, its middleware cost reads as a warning. */
const NOTICEABLE = 20;

interface ImpactTableProps {
  rows: readonly EndpointImpact[];
  looks: ReadonlyMap<string, MiddlewareLook>;
  onTrace: (requestId: string) => void;
}

/**
 * The endpoints whose calls spend most time in middleware: each with a bar
 * of what each middleware takes against the costliest, its time a call,
 * and the share of its calls' time that is — opening its newest chain.
 *
 * @param props - The endpoints, the middleware's looks, and what opens a chain
 * @returns The table
 * @example
 * ```tsx
 * <ImpactTable rows={endpointImpact(calls)} looks={looks} onTrace={open} />
 * ```
 */
export function ImpactTable({ rows, looks, onTrace }: ImpactTableProps): React.ReactNode {
  const costliest = Math.max(0.1, ...rows.map((r) => r.perCall));
  return (
    <section
      aria-label="Impact by endpoint"
      className="flex flex-col overflow-hidden rounded-sheet border border-line bg-panel"
    >
      <div className="flex min-h-12.5 flex-wrap items-center gap-3 border-b border-line px-4.5 py-2">
        <h2 className="m-0 text-ui font-semibold">Impact by endpoint</h2>
        <span className="text-label text-fg-subtle">average middleware time per call</span>
        <div className="flex-1" />
        <span className="flex flex-wrap gap-3">
          {[...looks].map(([name, look]) => (
            <span
              key={name}
              className="flex items-center gap-1.25 font-mono text-badge text-fg-muted"
            >
              <span className={cn("size-2 rounded-[2px] bg-current", look.tone)} />
              {name}
            </span>
          ))}
        </span>
      </div>
      {rows.map((row) => (
        <button
          key={row.key}
          type="button"
          onClick={() => onTrace(row.newestId)}
          className="grid min-h-10.5 w-full cursor-pointer grid-cols-[minmax(0,1fr)_minmax(120px,1.4fr)_60px_56px] items-center gap-3.5 border-b border-line px-4.5 text-left last:border-b-0 hover:bg-raised focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
        >
          <span className="flex min-w-0 items-center gap-2.25 font-mono text-small">
            <span
              className={cn("w-10 shrink-0 text-micro font-semibold", methodText(row.httpMethod))}
            >
              {row.httpMethod}
            </span>
            <span className="truncate">
              <span className="text-fg-subtle">{row.prefix}</span>
              {row.name}
            </span>
          </span>
          <span
            aria-hidden="true"
            className="flex h-2.5 gap-px overflow-hidden rounded-[3px]"
            style={{ width: `${(row.perCall / costliest) * 100}%` }}
          >
            {row.parts.map((part) => (
              <span
                key={part.name}
                title={`${part.name} · ${formatDuration(part.ms)}`}
                className={cn("bg-current", looks.get(part.name)?.tone)}
                style={{ flex: `${part.ms} 1 0px` }}
              />
            ))}
          </span>
          <span className="text-right font-mono text-small">{formatDuration(row.perCall)}</span>
          <span
            className={cn(
              "text-right font-mono text-label",
              row.share > NOTICEABLE ? "text-warn" : "text-fg-subtle",
            )}
          >{`${row.share.toFixed(0)}%`}</span>
        </button>
      ))}
    </section>
  );
}
