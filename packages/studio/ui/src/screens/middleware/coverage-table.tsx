import { Layers } from "lucide-react";
import { useState } from "react";

import { ChoiceMenu } from "@/design/choice-menu";
import type {
  CoverageRow,
  CoveredEndpoint,
  MiddlewareCoverage,
} from "@/features/middleware/middleware-coverage";
import { CoverageEndpoints } from "./coverage-endpoints";
import { CoverageRowButton } from "./coverage-row";
import type { MiddlewareLook } from "./middleware-look";

/** The choice that counts every source. */
const ALL = "*";

interface CoverageTableProps {
  coverage: MiddlewareCoverage;
  looks: ReadonlyMap<string, MiddlewareLook>;
  /** The source counted, or every one. */
  source: string | undefined;
  onSource: (source: string | undefined) => void;
}

/**
 * Which endpoints each middleware covers, read from the definitions: every
 * middleware declared anywhere in an API — on the API, by an endpoint's
 * `.retry()`, its base or its own `.use()` — with the number of endpoints
 * it covers of those counted, and the session's calls through it, so one no
 * call has run through yet shows too. A row opens the endpoints it covers,
 * each with the chain a call to it runs through; the last lists the
 * endpoints that run through none. The count narrows to one source.
 *
 * @param props - The coverage, the middleware's looks, the source counted and what changes it
 * @returns The table
 * @example
 * ```tsx
 * <CoverageTable coverage={coverage} looks={looks} source={search.source} onSource={pick} />
 * ```
 */
export function CoverageTable({
  coverage,
  looks,
  source,
  onSource,
}: CoverageTableProps): React.ReactNode {
  const [open, setOpen] = useState<string | null>(null);
  const rows: Array<{ key: string; row: CoverageRow | undefined; endpoints: CoveredEndpoint[] }> = [
    ...coverage.rows.map((row) => ({ key: row.key, row, endpoints: row.endpoints })),
    ...(coverage.uncovered.length > 0
      ? [{ key: "none", row: undefined, endpoints: coverage.uncovered }]
      : []),
  ];
  return (
    <section
      aria-label="Coverage"
      className="@container flex flex-col overflow-hidden rounded-sheet border border-line bg-panel"
    >
      <div className="flex min-h-12.5 flex-wrap items-center gap-3 border-b border-line px-4.5 py-2">
        <h2 className="m-0 text-ui font-semibold">Coverage</h2>
        <span className="text-label text-fg-subtle">
          {`the endpoints each middleware covers, of ${coverage.total} declared`}
        </span>
        <div className="flex-1" />
        {coverage.sources.length > 1 && (
          <ChoiceMenu
            icon={Layers}
            label="Source"
            choices={[
              { value: ALL, label: "All sources" },
              ...coverage.sources.map((name) => ({ value: name, label: name })),
            ]}
            value={source ?? ALL}
            onChange={(value) => onSource(value === ALL ? undefined : value)}
          />
        )}
      </div>
      {rows.map(({ key, row, endpoints }) => (
        <div key={key} className="border-b border-line last:border-b-0">
          <CoverageRowButton
            row={row}
            covered={endpoints.length}
            total={coverage.total}
            look={row ? looks.get(row.name) : undefined}
            open={open === key}
            onToggle={() => setOpen((shown) => (shown === key ? null : key))}
          />
          {open === key && <CoverageEndpoints row={row} endpoints={endpoints} />}
        </div>
      ))}
    </section>
  );
}
