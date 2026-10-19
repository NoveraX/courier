import { useNavigate, useSearch } from "@tanstack/react-router";
import { Sprout, Table2 } from "lucide-react";
import { useRef } from "react";

import type { MockStoreSearch } from "@/features/mocks/collection-view";
import { inspectorOf } from "@/features/requests/inspector-of";
import { useFirstLoad } from "@/hooks/use-first-load";
import { cn } from "@/lib/utils";
import { useStoreCrud } from "@/mocks/use-store-crud";
import type { MockCollectionEntry, MockServerInfo } from "@/store/mock-slice";
import { CollectionTable } from "./collection-table";
import { MocksSkeleton } from "./mocks-skeleton";
import { useCurrentInView } from "./use-current-in-view";
import { useMockRecords } from "./use-mock-records";
import { useMockServer } from "./use-mock-server";

/* A window too narrow for the collections beside the table puts them over it, as a row of
   chips that scrolls sideways. A list too short for its collections scrolls rather than
   squeezing them. */
const NAV =
  "flex min-h-0 flex-col gap-0.5 overflow-y-auto border-r border-line px-2.5 py-3.5 max-[700px]:scroll-row max-[700px]:flex-row max-[700px]:items-center max-[700px]:gap-1.5 max-[700px]:border-r-0 max-[700px]:border-b max-[700px]:px-4 max-[700px]:py-2.5";
const ITEM =
  "flex h-8 shrink-0 cursor-pointer items-center gap-2.5 rounded-control px-2.5 text-left max-[700px]:border max-[700px]:border-line pointer-coarse:h-10";

/**
 * The mock's store: its collections down the side with their counts and a
 * way to seed them all again — over the table, as chips, in a narrow
 * window — and the open collection's records as a table edited in place.
 * The collection open stays in the address.
 *
 * @returns The Store tab
 * @example
 * ```tsx
 * <MockStoreScreen />
 * ```
 */
export function MockStoreScreen(): React.ReactNode {
  const { server } = useMockServer();
  const first = useFirstLoad();
  const loading = first.requests || first.sources;
  const search: MockStoreSearch = useSearch({ from: "/mocks/store" });
  const navigate = useNavigate({ from: "/mocks/store" });
  const crud = useStoreCrud();
  const waiting = useMockRecords(server);
  const navRef = useRef<HTMLElement>(null);
  const open =
    server?.collections.find((c) => c.name === search.collection) ?? server?.collections[0];
  useCurrentInView(navRef, open?.name);
  if (!server) return loading ? <MocksSkeleton view="list" /> : null;
  return (
    <div className="grid min-h-0 flex-1 grid-cols-[220px_minmax(0,1fr)] grid-rows-[minmax(0,1fr)] max-[700px]:grid-cols-1 max-[700px]:grid-rows-[auto_minmax(0,1fr)]">
      <nav ref={navRef} aria-label="Collections" className={NAV}>
        <h2 className="px-2 pb-1.5 text-label font-semibold text-fg-subtle max-[700px]:sr-only">
          Collections
        </h2>
        {server.collections.length === 0 && (
          <p className="px-2 text-small whitespace-nowrap text-fg-subtle">
            The mock keeps no data.
          </p>
        )}
        {server.collections.map((collection) => {
          const on = collection.name === open?.name;
          return (
            <button
              key={collection.name}
              type="button"
              aria-current={on ? "true" : undefined}
              onClick={() =>
                void navigate({
                  search: (prev) => ({ ...inspectorOf(prev), collection: collection.name }),
                  replace: true,
                })
              }
              className={cn(
                ITEM,
                on ? "bg-raised text-fg" : "text-fg-muted hover:bg-raised/60 hover:text-fg",
              )}
            >
              <Table2
                aria-hidden="true"
                className={cn("size-3.25", on ? "text-syntax-type" : "text-fg-subtle")}
              />
              <span className="min-w-0 flex-1 truncate font-mono text-control">
                {collection.name}
              </span>
              <span className="text-badge text-fg-subtle tabular-nums">{collection.count}</span>
            </button>
          );
        })}
        {server.collections.length > 0 && (
          <>
            <div className="mx-1 my-2.5 h-px shrink-0 bg-line max-[700px]:my-0 max-[700px]:h-5 max-[700px]:w-px" />
            <button
              type="button"
              onClick={() => crud.seedAll(server.serverId)}
              className={cn(ITEM, "text-control text-fg-muted hover:bg-raised hover:text-fg")}
            >
              <Sprout aria-hidden="true" className="size-3.25" />
              Reseed all
            </button>
          </>
        )}
      </nav>
      <RecordsPane server={server} open={open} waiting={waiting} />
    </div>
  );
}

/* The open collection's records; while the page waits for them, why they have not come when Studio said. */
function RecordsPane({
  server,
  open,
  waiting,
}: {
  server: MockServerInfo;
  open: MockCollectionEntry | undefined;
  waiting: boolean;
}): React.ReactNode {
  if (!open) {
    return (
      <p className="m-auto p-10 text-center text-control text-fg-subtle">No collection to show</p>
    );
  }
  if (waiting && server.recordsProblem) {
    return (
      <div className="p-5">
        <p role="alert" className="m-0 rounded-panel bg-err-dim px-3 py-2.5 text-control text-err">
          Studio did not send the records: {server.recordsProblem} The page asks again on its own.
        </p>
      </div>
    );
  }
  if (waiting) return <MocksSkeleton view="records" />;
  return <CollectionTable serverId={server.serverId} collection={open} routes={server.routes} />;
}
