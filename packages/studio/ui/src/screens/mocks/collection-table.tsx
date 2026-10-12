import { EllipsisVertical, Plus } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { POP_MOTION } from "@/design/overlay-motion";
import { collectionView } from "@/features/mocks/collection-view";
import { cn } from "@/lib/utils";
import { useStoreCrud } from "@/mocks/use-store-crud";
import type { MockCollectionEntry, MockRouteEntry } from "@/store/mock-slice";
import { CollectionRows } from "./collection-rows";

const MENU_ITEM =
  "flex h-7.5 cursor-pointer items-center rounded-[6px] px-2.25 text-control text-fg-muted outline-none data-[highlighted]:bg-raised data-[highlighted]:text-fg pointer-coarse:h-10";

interface CollectionTableProps {
  serverId: string;
  collection: MockCollectionEntry;
  routes: readonly MockRouteEntry[];
}

/**
 * A collection's records as a table: its name, counts and Add record over
 * columns of every field with its type, each cell edited in place and each
 * record deleted from its row — changes the mock's handlers serve at once.
 * Only the records in view are drawn, however many the collection holds.
 * On a phone the counts go under the name.
 *
 * @param props - The server, the collection, and the routes whose shapes name the types
 * @returns The table
 * @example
 * ```tsx
 * <CollectionTable serverId="shop" collection={users} routes={server.routes} />
 * ```
 */
export function CollectionTable({
  serverId,
  collection,
  routes,
}: CollectionTableProps): React.ReactNode {
  const crud = useStoreCrud();
  const { rows, columns } = collectionView(collection, routes);
  return (
    <section aria-label={`Collection ${collection.name}`} className="flex min-h-0 min-w-0 flex-col">
      <div className="flex items-center gap-2.5 px-4.5 py-3.5 max-sm:px-4 max-sm:py-3">
        <div className="flex min-w-0 flex-1 items-center gap-2.5 max-sm:flex-col max-sm:items-start max-sm:gap-0.5">
          <h2 className="max-w-full truncate font-mono text-title font-semibold">
            {collection.name}
          </h2>
          <span className="text-control text-fg-subtle">
            {collection.count} {collection.count === 1 ? "record" : "records"} · {columns.length}{" "}
            {columns.length === 1 ? "field" : "fields"}
          </span>
        </div>
        <button
          type="button"
          onClick={() => crud.addRecord(serverId, collection.name)}
          className="flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-card border border-line px-2.5 text-small text-fg-muted hover:border-line-strong hover:text-fg pointer-coarse:h-9"
        >
          <Plus aria-hidden="true" className="size-3" />
          Add record
        </button>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger
            aria-label="More for this collection"
            className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-card text-fg-subtle hover:bg-raised hover:text-fg pointer-coarse:size-9"
          >
            <EllipsisVertical aria-hidden="true" className="size-3.5" />
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              sideOffset={6}
              collisionPadding={8}
              className={cn("z-50 w-48 rounded-panel bg-panel p-1 shadow-overlay", POP_MOTION)}
            >
              <DropdownMenu.Item
                className={MENU_ITEM}
                onSelect={() =>
                  crud.seedCollection(serverId, collection.name, Math.max(1, collection.count))
                }
              >
                Reseed this collection
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className={`${MENU_ITEM} data-[highlighted]:text-err`}
                onSelect={() => crud.clearCollection(serverId, collection.name)}
              >
                Clear every record
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
      <CollectionRows
        serverId={serverId}
        collection={collection.name}
        rows={rows}
        columns={columns}
      />
      <p className="px-4.5 py-3.5 text-label text-fg-subtle max-sm:px-4">
        {rows.length === 0 ? (
          "No records — Add record, or reseed the collection"
        ) : (
          <>
            <span className="pointer-coarse:hidden">Click</span>
            <span className="hidden pointer-coarse:inline">Tap</span> a cell to edit · the mock's
            handlers serve each change at once
          </>
        )}
      </p>
    </section>
  );
}
