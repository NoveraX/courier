import { lastCallLabel } from "@/features/explorer/endpoint-key";
import type { EndpointNode } from "@/features/explorer/explorer-model";
import { methodLabelOf } from "@/features/explorer/method-label";
import { cn } from "@/lib/utils";
import { EndpointTagChips } from "./endpoint-tag-chips";
import { methodClassOf } from "./method-class";
import { rowFiguresOf } from "./row-figures-of";

interface EndpointRowProps {
  endpoint: EndpointNode;
  columns: string;
  /** Whether the row has room for the middleware and the last call. */
  wide: boolean;
  selected: boolean;
  now: number;
  slowMs: number;
  onOpen: (key: string) => void;
}

/**
 * An endpoint in the Endpoints list: its health, method, name and path, its
 * kind and tags, middleware, calls, p95, error rate and last call — dimmed
 * while never called; a click opens its panel.
 *
 * @param props - The endpoint, the grid's columns, whether it is wide and selected, the time and the slow threshold
 * @returns The row
 * @example
 * ```tsx
 * <EndpointRow endpoint={e} columns={COLUMNS} wide selected={false} now={now} slowMs={500} onOpen={open} />
 * ```
 */
export function EndpointRow(props: EndpointRowProps): React.ReactNode {
  const { endpoint: e, columns, wide, selected, now, slowMs, onOpen } = props;
  const method = methodLabelOf(e);
  const { p95, errors } = rowFiguresOf(e, slowMs);
  return (
    <button
      type="button"
      onClick={() => onOpen(e.key)}
      aria-pressed={selected}
      style={{ gridTemplateColumns: columns }}
      className={cn(
        "grid min-h-11 w-full cursor-pointer items-center gap-3 border-b border-line px-5 py-1.5 text-left hover:bg-raised focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand",
        selected && "bg-brand-dim",
        !e.metrics.calls && "opacity-60",
      )}
    >
      <span className="flex min-w-0 items-center gap-2.5">
        <span
          className={cn("w-10.5 shrink-0 font-mono text-meta font-semibold", methodClassOf(method))}
        >
          {method}
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate font-mono text-control">
            {e.group && <span className="text-fg-subtle">{e.group}.</span>}
            {e.method}
          </span>
          <span className="truncate font-mono text-meta text-fg-subtle">{e.path}</span>
        </span>
      </span>
      <span className="flex flex-wrap gap-1.25">
        <EndpointTagChips endpoint={e} />
      </span>
      {wide && (
        <span className="flex flex-wrap gap-1">
          {e.middleware.map((name) => (
            <span
              key={name}
              className="flex h-4.75 items-center rounded-[5px] border border-line px-1.5 font-mono text-meta text-fg-muted"
            >
              {name}
            </span>
          ))}
        </span>
      )}
      <span className="text-right font-mono text-small text-fg-muted tabular-nums">
        {e.metrics.calls || "—"}
      </span>
      <span className={cn("text-right font-mono text-small tabular-nums", p95.className)}>
        {p95.text}
      </span>
      <span className={cn("text-right font-mono text-small tabular-nums", errors.className)}>
        {errors.text}
      </span>
      {wide && (
        <span className="text-right font-mono text-label text-fg-subtle">
          {lastCallLabel(e.metrics.last, now)}
        </span>
      )}
    </button>
  );
}
