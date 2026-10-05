import { useNavigate, useSearch } from "@tanstack/react-router";
import { Sprout, Table2 } from "lucide-react";

import type { MockStoreSearch } from "@/features/mocks/collection-view";
import { cn } from "@/lib/utils";
import { useStoreCrud } from "@/mocks/use-store-crud";
import { CollectionTable } from "./collection-table";
import { useMockServer } from "./use-mock-server";

/**
 * The mock's store: its collections down the side with their counts and a
 * way to seed them all again, and the open collection's records as a table
 * edited in place. The collection open stays in the address.
 *
 * @returns The Store tab
 * @example
 * ```tsx
 * <MockStoreScreen />
 * ```
 */
export function MockStoreScreen(): React.ReactNode {
  const { server } = useMockServer();
  const search: MockStoreSearch = useSearch({ from: "/mocks/store" });
  const navigate = useNavigate({ from: "/mocks/store" });
  const crud = useStoreCrud();
  if (!server) return null;
  const open =
    server.collections.find((c) => c.name === search.collection) ?? server.collections[0];
  return (
    <div className="grid min-h-full grid-cols-[220px_minmax(0,1fr)] max-[700px]:grid-cols-1">
      <nav
        aria-label="Collections"
        className="flex flex-col gap-0.5 border-r border-line px-2.5 py-3.5 max-[700px]:border-r-0 max-[700px]:border-b"
      >
        <h2 className="px-2 pb-1.5 text-label font-semibold text-fg-subtle">Collections</h2>
        {server.collections.length === 0 && (
          <p className="px-2 text-small text-fg-subtle">The mock keeps no data.</p>
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
                  search: (prev) => ({ req: prev.req, tab: prev.tab, collection: collection.name }),
                  replace: true,
                })
              }
              className={cn(
                "flex h-8 cursor-pointer items-center gap-2.5 rounded-control px-2.5 text-left",
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
            <div className="mx-1 my-2.5 h-px bg-line" />
            <button
              type="button"
              onClick={() => crud.seedAll(server.serverId)}
              className="flex h-8 cursor-pointer items-center gap-2.5 rounded-control px-2.5 text-control text-fg-muted hover:bg-raised hover:text-fg"
            >
              <Sprout aria-hidden="true" className="size-3.25" />
              Reseed all
            </button>
          </>
        )}
      </nav>
      {open ? (
        <CollectionTable serverId={server.serverId} collection={open} routes={server.routes} />
      ) : (
        <p className="p-10 text-center text-control text-fg-subtle">No collection to show</p>
      )}
    </div>
  );
}
