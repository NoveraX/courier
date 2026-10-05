import { EllipsisVertical, Plus, Trash2 } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { POP_MOTION } from "@/design/overlay-motion";
import { collectionView } from "@/features/mocks/collection-view";
import { buildDefaultRecord, recordKey } from "@/features/mocks/data-table-utils";
import { cn } from "@/lib/utils";
import { useStoreCrud } from "@/mocks/use-store-crud";
import type { MockCollectionEntry, MockRouteEntry } from "@/store/mock-slice";
import { EditableCell } from "./editable-cell";

const MENU_ITEM =
  "flex h-7.5 cursor-pointer items-center rounded-[6px] px-2.25 text-control text-fg-muted outline-none data-[highlighted]:bg-raised data-[highlighted]:text-fg";

interface CollectionTableProps {
  serverId: string;
  collection: MockCollectionEntry;
  routes: readonly MockRouteEntry[];
}

/**
 * A collection's records as a table: its name, counts and Add record over
 * columns of every field with its type, each cell edited in place and each
 * record deleted from its row — changes the mock's handlers serve at once.
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
  const types = Object.fromEntries(columns.map((c) => [c.field, c.type]));
  const template = `repeat(${Math.max(1, columns.length)}, minmax(120px, 1fr)) 36px`;
  return (
    <section aria-label={`Collection ${collection.name}`} className="flex min-w-0 flex-col">
      <div className="flex items-center gap-2.5 px-4.5 py-3.5">
        <h2 className="font-mono text-title font-semibold">{collection.name}</h2>
        <span className="text-control text-fg-subtle">
          {collection.count} {collection.count === 1 ? "record" : "records"} · {columns.length}{" "}
          {columns.length === 1 ? "field" : "fields"}
        </span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => crud.createRecord(serverId, collection.name, buildDefaultRecord(types))}
          className="flex h-7 cursor-pointer items-center gap-1.5 rounded-card border border-line px-2.5 text-small text-fg-muted hover:border-line-strong hover:text-fg"
        >
          <Plus aria-hidden="true" className="size-3" />
          Add record
        </button>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger
            aria-label="More for this collection"
            className="flex size-7 cursor-pointer items-center justify-center rounded-card text-fg-subtle hover:bg-raised hover:text-fg"
          >
            <EllipsisVertical aria-hidden="true" className="size-3.5" />
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              sideOffset={6}
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
      <div className="overflow-x-auto">
        <div className="min-w-max">
          <div
            className="grid h-8.5 items-center border-y border-line bg-panel-subtle px-3.5 text-label"
            style={{ gridTemplateColumns: template }}
          >
            {columns.map((column) => (
              <span
                key={column.field}
                className="flex items-baseline gap-1.5 px-2 font-mono text-fg-subtle"
              >
                {column.field}
                <span className="font-sans text-meta text-syntax-type">{column.label}</span>
              </span>
            ))}
          </div>
          {rows.map((row, index) => {
            const id = recordKey(row, index);
            return (
              <div
                key={id}
                className="group grid min-h-9.5 items-center border-b border-line px-3.5"
                style={{ gridTemplateColumns: template }}
              >
                {columns.map((column) => (
                  <EditableCell
                    key={column.field}
                    value={row[column.field]}
                    type={column.type}
                    locked={column.field === "id" || column.field === "_id"}
                    enumLike={column.label === "enum"}
                    onSave={(value) =>
                      crud.updateRecord(serverId, collection.name, id, { [column.field]: value })
                    }
                  />
                ))}
                <button
                  type="button"
                  aria-label={`Delete record ${id}`}
                  onClick={() => crud.deleteRecords(serverId, collection.name, [id])}
                  className="flex size-7 cursor-pointer items-center justify-center rounded-[6px] text-fg-subtle opacity-0 group-hover:opacity-100 hover:bg-raised hover:text-err focus-visible:opacity-100"
                >
                  <Trash2 aria-hidden="true" className="size-3.25" />
                </button>
              </div>
            );
          })}
        </div>
      </div>
      <p className="px-4.5 py-3.5 text-label text-fg-subtle">
        {rows.length === 0
          ? "No records — Add record, or reseed the collection"
          : "Click a cell to edit · the mock's handlers serve each change at once"}
      </p>
    </section>
  );
}
