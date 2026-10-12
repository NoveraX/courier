import { withoutTrailingSlashes } from "@noverax/courier/internal";
import { Copy } from "lucide-react";

import { CodeLines } from "@/design/code/code-lines";
import { tokenizeJsonLine } from "@/design/code/tokenize-json-line";
import { copyToClipboard } from "@/lib/clipboard";
import { buildCurlSnippet } from "@/lib/snippets";
import { cn } from "@/lib/utils";
import type { MockRouteEntry } from "@/store/mock-slice";

const ANSWERED_BY: Readonly<Record<MockRouteEntry["source"], (name: string) => string>> = {
  auto: (name) =>
    `Generated from the response schema of ${name}: records the mock keeps in its store.`,
  override: () => "An override in courier.mocks.ts answers this route.",
  scenario: () => "The scenario that is on answers this route.",
  upstream: () =>
    "The mock does not answer this route: each call goes to the source's own server, as your app calls it.",
  fixtures: (name) =>
    `Recordings of the source's own server answer ${name}: a call made for the first time goes to the server once and is saved.`,
};

function Heading({ children }: { children: React.ReactNode }): React.ReactNode {
  return <h3 className="text-label font-semibold text-fg-muted">{children}</h3>;
}

/**
 * What an opened route shows: what answers it and how to call it, the
 * shape its answers take, and a sample answer — side by side, or one under
 * the other when there is no room, set in from the route's path, or from
 * the list's edge under a stacked row.
 *
 * @param props - The route, the mock server's address, and whether its row is stacked
 * @returns The detail
 * @example
 * ```tsx
 * <RouteDetail route={route} serverUrl="http://localhost:7001" stacked={false} />
 * ```
 */
export function RouteDetail({
  route,
  serverUrl,
  stacked,
}: {
  route: MockRouteEntry;
  serverUrl: string;
  stacked: boolean;
}): React.ReactNode {
  const url = `${withoutTrailingSlashes(serverUrl)}${route.fullPath}`;
  const schema = Object.entries(route.responseSchema ?? {});
  return (
    <div
      className={cn(
        "grid grid-cols-[repeat(auto-fit,minmax(min(260px,100%),1fr))] gap-3 bg-bg-subtle pt-1 pr-4 pb-4",
        stacked ? "pl-4" : "pl-10",
      )}
    >
      <div className="flex flex-col gap-2">
        <Heading>Handler</Heading>
        <p className="text-small text-fg-muted">
          {ANSWERED_BY[route.source](`${route.group}.${route.endpoint}`)}
        </p>
        <div className="flex h-8 items-center gap-2 rounded-card border border-line bg-inset pr-1 pl-2.5 font-mono text-small pointer-coarse:h-11">
          <span className="min-w-0 flex-1 truncate">{url}</span>
          <button
            type="button"
            onClick={() =>
              void copyToClipboard(
                buildCurlSnippet({ url, method: route.httpMethod.toUpperCase() }),
                "cURL",
              )
            }
            className="flex h-6 shrink-0 cursor-pointer items-center gap-1.5 rounded-[6px] px-2 font-sans text-small text-fg-subtle hover:bg-raised hover:text-fg pointer-coarse:h-9 pointer-coarse:px-2.5"
          >
            <Copy aria-hidden="true" className="size-3" />
            cURL
          </button>
        </div>
        {schema.length > 0 && (
          <div className="overflow-hidden rounded-panel border border-line">
            {schema.map(([field, type]) => (
              <div
                key={field}
                className="flex h-7.5 items-center justify-between gap-3 border-b border-line px-3 font-mono text-small last:border-b-0"
              >
                <span className="text-syntax-function">{field}</span>
                <span className="text-syntax-type">{type}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <Heading>Sample response</Heading>
        {route.exampleResponse === undefined ? (
          <p className="rounded-panel border border-line bg-inset px-3 py-4 text-small text-fg-subtle">
            No sample — the route declares no response schema.
          </p>
        ) : (
          <div className="overflow-hidden rounded-panel border border-line bg-inset font-mono">
            <CodeLines
              code={JSON.stringify(route.exampleResponse, null, 2)}
              tokenize={tokenizeJsonLine}
              variant="panel"
            />
          </div>
        )}
      </div>
    </div>
  );
}
