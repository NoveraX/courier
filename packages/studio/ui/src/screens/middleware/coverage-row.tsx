import type { MiddlewareLayer } from "@noverax/courier/internal";
import { ChevronRight } from "lucide-react";

import type { CoverageRow } from "@/features/middleware/middleware-coverage";
import { cn } from "@/lib/utils";
import { LAYER_TITLE } from "./coverage-endpoints";
import type { MiddlewareLook } from "./middleware-look";

const LAYER_LABEL: Readonly<Record<MiddlewareLayer, string>> = {
  api: "API",
  retry: ".retry()",
  endpoint: "endpoint",
};

interface CoverageRowButtonProps {
  /** The middleware, or none for the endpoints with no middleware. */
  row: CoverageRow | undefined;
  /** How many endpoints it covers, and of how many. */
  covered: number;
  total: number;
  look: MiddlewareLook | undefined;
  open: boolean;
  onToggle: () => void;
}

/**
 * One row of the coverage table: the middleware and where it is declared,
 * a bar of the endpoints it covers, "N of M", and the session's calls
 * through it and those it failed — opening the endpoints it covers.
 *
 * @param props - The row, its count, its look, and whether it is open
 * @returns The row's button
 * @example
 * ```tsx
 * <CoverageRowButton row={row} covered={2} total={4} look={look} open={false} onToggle={toggle} />
 * ```
 */
export function CoverageRowButton({
  row,
  covered,
  total,
  look,
  open,
  onToggle,
}: CoverageRowButtonProps): React.ReactNode {
  const share = total > 0 ? covered / total : 0;
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={onToggle}
      className="grid min-h-10.5 w-full cursor-pointer grid-cols-[minmax(0,1fr)_minmax(100px,1.2fr)_76px_52px_52px] items-center gap-3.5 px-4.5 text-left hover:bg-raised focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand pointer-coarse:min-h-11 @max-[35rem]:grid-cols-[minmax(0,1fr)_auto] @max-[35rem]:gap-y-1.5 @max-[35rem]:py-2"
    >
      <span className="flex min-w-0 items-center gap-2">
        <ChevronRight
          aria-hidden="true"
          className={cn("size-3 shrink-0 text-fg-subtle transition-transform", open && "rotate-90")}
        />
        <span className={cn("truncate font-mono text-small", row ? "text-fg" : "text-fg-subtle")}>
          {row ? row.name : "No middleware"}
        </span>
        {row && (
          <span
            title={LAYER_TITLE[row.layer]}
            className="flex h-4.5 shrink-0 items-center rounded-[5px] border border-line px-1.5 text-meta text-fg-muted"
          >
            {LAYER_LABEL[row.layer]}
          </span>
        )}
      </span>
      <span aria-hidden="true" className="h-1.5 overflow-hidden rounded-[2px] bg-raised">
        <span
          className={cn(
            "block h-full rounded-[2px] bg-current",
            row ? (look?.tone ?? "text-brand") : "text-fg-subtle",
          )}
          style={{ width: `${share * 100}%` }}
        />
      </span>
      <span className="text-right font-mono text-small @max-[35rem]:col-start-2 @max-[35rem]:row-start-1">
        {`${covered} of ${total}`}
      </span>
      <span
        title={row ? `Calls through a middleware named ${row.name} this session` : undefined}
        className="text-right font-mono text-label text-fg-subtle @max-[35rem]:hidden"
      >
        {row ? `${row.calls} calls` : ""}
      </span>
      <span
        className={cn(
          "text-right font-mono text-label @max-[35rem]:hidden",
          row && row.errors > 0 ? "text-err" : "text-fg-subtle",
        )}
      >
        {row && row.errors > 0 ? `${row.errors} failed` : ""}
      </span>
    </button>
  );
}
