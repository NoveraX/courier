import type { MiddlewareLayer } from "@noverax/courier/internal";
import { ChevronRight } from "lucide-react";
import { Fragment } from "react";

import { methodText } from "@/design/method-color";
import type { CoverageRow, CoveredEndpoint } from "@/features/middleware/middleware-coverage";
import { cn } from "@/lib/utils";

/** What each place a middleware is declared in means, as its badge and the chain's steps explain it. */
export const LAYER_TITLE: Readonly<Record<MiddlewareLayer, string>> = {
  api: "Declared on the API: defineApi({ middleware })",
  retry: "The endpoint's .retry() policy",
  endpoint: "Added by the endpoint's base, courier({ middleware }), or its own .use()",
};

/* Each step of a chain with a key of its own: a middleware a chain runs through twice is keyed by its turn. */
function stepsOf(
  endpoint: CoveredEndpoint,
): Array<{ key: string; step: CoveredEndpoint["chain"][number]; first: boolean }> {
  const turns = new Map<string, number>();
  return endpoint.chain.map((step, at) => {
    const id = `${step.layer}:${step.name}`;
    const turn = (turns.get(id) ?? 0) + 1;
    turns.set(id, turn);
    return { key: `${id}#${turn}`, step, first: at === 0 };
  });
}

/* An endpoint and the chain a call to it runs through, the middleware of the row it is listed under marked. */
function EndpointLine({
  endpoint,
  marked,
}: {
  endpoint: CoveredEndpoint;
  marked: CoverageRow | undefined;
}): React.ReactNode {
  const name = endpoint.group ? `${endpoint.group}.${endpoint.method}` : endpoint.method;
  return (
    <li className="flex min-h-8 flex-wrap items-center gap-x-2.5 gap-y-1 px-4.5 py-1 font-mono text-small">
      <span
        className={cn(
          "w-10 shrink-0 text-micro font-semibold",
          methodText(endpoint.httpMethod ?? "GET"),
        )}
      >
        {endpoint.httpMethod ?? "GET"}
      </span>
      <span className="min-w-0 truncate">
        <span className="text-fg-subtle">{endpoint.source}.</span>
        {name}
      </span>
      <span className="flex min-w-0 flex-wrap items-center gap-1 text-badge text-fg-subtle">
        {stepsOf(endpoint).map(({ key, step, first }) => (
          <Fragment key={key}>
            {!first && <ChevronRight aria-hidden="true" className="size-2.75" />}
            <span
              title={LAYER_TITLE[step.layer]}
              className={cn(
                marked?.name === step.name && marked.layer === step.layer && "text-fg font-medium",
              )}
            >
              {step.name}
            </span>
          </Fragment>
        ))}
      </span>
    </li>
  );
}

/**
 * The endpoints a coverage row opens, each with the chain a call to it runs
 * through, the row's middleware marked in it.
 *
 * @param props - The row, or none for the endpoints with no middleware, and its endpoints
 * @returns The list
 * @example
 * ```tsx
 * <CoverageEndpoints row={row} endpoints={row.endpoints} />
 * ```
 */
export function CoverageEndpoints({
  row,
  endpoints,
}: {
  row: CoverageRow | undefined;
  endpoints: readonly CoveredEndpoint[];
}): React.ReactNode {
  return (
    <ul
      aria-label={row ? `Endpoints ${row.name} covers` : "Endpoints with no middleware"}
      className="m-0 list-none border-t border-line bg-inset p-0 py-1"
    >
      {endpoints.map((endpoint) => (
        <EndpointLine key={endpoint.key} endpoint={endpoint} marked={row} />
      ))}
    </ul>
  );
}
