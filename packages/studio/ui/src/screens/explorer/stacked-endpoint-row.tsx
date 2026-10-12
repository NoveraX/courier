import type { EndpointNode } from "@/features/explorer/explorer-model";
import { methodLabelOf } from "@/features/explorer/method-label";
import { cn } from "@/lib/utils";
import { EndpointTagChips } from "./endpoint-tag-chips";
import { methodClassOf } from "./method-class";
import { rowFiguresOf } from "./row-figures-of";

interface StackedEndpointRowProps {
  endpoint: EndpointNode;
  selected: boolean;
  slowMs: number;
  onOpen: (key: string) => void;
}

/**
 * An endpoint in the Endpoints list where the list has no room for its
 * columns, as on a phone: its method, name and p95 on one line; its path,
 * kind and tags, calls and error rate on the next, each figure saying what
 * it is — dimmed while never called. A tap opens its panel, which has its
 * middleware and last call too.
 *
 * @param props - The endpoint, whether it is open, the slow threshold, and what opens it
 * @returns The row
 * @example
 * ```tsx
 * <StackedEndpointRow endpoint={e} selected={false} slowMs={500} onOpen={open} />
 * ```
 */
export function StackedEndpointRow(props: StackedEndpointRowProps): React.ReactNode {
  const { endpoint: e, selected, slowMs, onOpen } = props;
  const method = methodLabelOf(e);
  const { p95, errors } = rowFiguresOf(e, slowMs);
  const { calls } = e.metrics;
  return (
    <button
      type="button"
      onClick={() => onOpen(e.key)}
      aria-pressed={selected}
      className={cn(
        "grid min-h-13 w-full cursor-pointer grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-1 border-b border-line py-2 pr-4 pl-5 text-left hover:bg-raised focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand",
        selected && "bg-brand-dim",
        !calls && "opacity-60",
      )}
    >
      <span className={cn("font-mono text-meta font-semibold", methodClassOf(method))}>
        {method}
      </span>
      <span className="truncate font-mono text-control">
        {e.group && <span className="text-fg-subtle">{e.group}.</span>}
        {e.method}
      </span>
      <span className={cn("text-right font-mono text-small tabular-nums", p95.className)}>
        {e.metrics.p95 !== null && <span className="text-fg-subtle">p95 </span>}
        {p95.text}
      </span>
      <span className="col-start-2 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
        <span className="max-w-full truncate font-mono text-meta text-fg-subtle">{e.path}</span>
        <EndpointTagChips endpoint={e} />
      </span>
      <span className="text-right text-meta whitespace-nowrap text-fg-subtle tabular-nums">
        {calls ? `${calls} ${calls === 1 ? "call" : "calls"}` : "no calls"}
        {calls > 0 && (
          <>
            {" · "}
            <span className={errors.className}>{errors.text}</span> err
          </>
        )}
      </span>
    </button>
  );
}
