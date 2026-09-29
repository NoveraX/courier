import { Database } from "lucide-react";
import { useEffect } from "react";
import { EmptyState } from "@/components/shared/empty-state";
import { PageShell } from "@/components/shared/page-shell";
import { useActiveServer } from "@/store/mock-slice";
import { CollectionList } from "./collection-list";
import { DataTable } from "./data-table";
import { useStoreCrud } from "./use-store-crud";

export function MockStoreView(): React.ReactElement {
  const server = useActiveServer();
  const collections = server?.collections ?? [];
  const crud = useStoreCrud();

  const { activeCollection, selectCollection } = crud;
  useEffect(() => {
    if (!activeCollection && collections.length > 0) {
      selectCollection(collections[0]!.name);
    }
  }, [collections, activeCollection, selectCollection]);

  if (!server) {
    return (
      <PageShell center>
        <EmptyState
          icon={Database}
          heading="No server selected"
          description="Select a mock server to browse its store."
        />
      </PageShell>
    );
  }

  if (collections.length === 0) {
    return (
      <PageShell center>
        <EmptyState
          icon={Database}
          heading="No collections"
          description="This server has no data collections yet."
        />
      </PageShell>
    );
  }

  const activeCol = collections.find((c) => c.name === activeCollection);

  const handleAddRecord = (defaults: Record<string, unknown>) => {
    if (!activeCol) return;
    crud.createRecord(server.serverId, activeCol.name, defaults);
  };

  const handleUpdateField = (recordId: string, field: string, value: unknown) => {
    if (!activeCol) return;
    crud.updateRecord(server.serverId, activeCol.name, recordId, { [field]: value });
  };

  const handleBulkDelete = (ids: string[]) => {
    if (!activeCol) return;
    crud.deleteRecords(server.serverId, activeCol.name, ids);
  };

  return (
    <PageShell noScroll>
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <CollectionList
          collections={collections}
          active={activeCollection}
          disabled={server.processStatus !== "running"}
          onSelect={selectCollection}
          onSeed={(name, count) => crud.seedCollection(server.serverId, name, count)}
          onClear={(name) => crud.clearCollection(server.serverId, name)}
          onSeedAll={(count) => crud.seedAll(server.serverId, count)}
        />

        {activeCol ? (
          <DataTable
            collection={activeCol}
            onDeleteRecords={handleBulkDelete}
            onAddRecord={handleAddRecord}
            onUpdateField={handleUpdateField}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center text-body-sm text-muted-foreground/50">
            Select a collection
          </div>
        )}
      </div>
    </PageShell>
  );
}
