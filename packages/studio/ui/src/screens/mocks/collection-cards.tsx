import { Link } from "@tanstack/react-router";
import { Table2 } from "lucide-react";

import { CardSection } from "@/design/card-section";
import { inspectorOf } from "@/features/requests/inspector-of";
import type { MockCollectionEntry } from "@/store/mock-slice";

/**
 * The mock's data collections, each with how many records it holds.
 *
 * @param props - The server's collections
 * @returns The card
 * @example
 * ```tsx
 * <CollectionCards collections={server.collections} />
 * ```
 */
export function CollectionCards({
  collections,
}: {
  collections: readonly MockCollectionEntry[];
}): React.ReactNode {
  return (
    <CardSection
      title="Collections"
      aside={
        <>
          <div className="flex-1" />
          <Link
            from="/mocks"
            to="/mocks/store"
            search={(prev) => ({ ...inspectorOf(prev) })}
            className="flex h-6.5 items-center rounded-[6px] px-2 text-small text-fg-subtle hover:bg-raised hover:text-fg"
          >
            Open store →
          </Link>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-2 p-3">
        {collections.length === 0 && (
          <p className="col-span-2 px-1 py-4 text-center text-control text-fg-subtle">
            No collections — the mock keeps no data
          </p>
        )}
        {collections.map((collection) => (
          <Link
            key={collection.name}
            from="/mocks"
            to="/mocks/store"
            search={(prev) => ({ ...inspectorOf(prev), collection: collection.name })}
            className="flex items-center gap-2.5 rounded-panel border border-line bg-inset px-3 py-2.5 hover:border-line-strong"
          >
            <Table2 aria-hidden="true" className="size-3.5 text-syntax-type" />
            <span className="flex min-w-0 flex-col gap-px">
              <span className="truncate font-mono text-control">{collection.name}</span>
              <span className="text-badge text-fg-subtle">
                {collection.count} {collection.count === 1 ? "record" : "records"}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </CardSection>
  );
}
