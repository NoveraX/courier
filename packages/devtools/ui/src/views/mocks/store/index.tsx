import { useEffect, useState } from "react";
import { Database } from "lucide-react";
import { PageShell } from "@/components/shared/page-shell";
import { EmptyState } from "@/components/shared/empty-state";
import { useActiveServer } from "@/store/mock-slice";
import { CollectionList } from "./collection-list";
import { DataTable } from "./data-table";
import { RecordDetail } from "./record-detail";
import { useStoreCrud } from "./use-store-crud";

export function MockStoreView(): React.ReactElement {
  const server = useActiveServer();
  const collections = server?.collections ?? [];
  const crud = useStoreCrud();
  const [selectedRecord, setSelectedRecord] = useState<Record<string, unknown> | null>(null);

  // Auto-select first collection
  useEffect(() => {
    if (!crud.activeCollection && collections.length > 0) {
      crud.selectCollection(collections[0]!.name);
    }
  }, [collections, crud.activeCollection]);

  if (!server) {
    return (
      <PageShell center>
        <EmptyState icon={Database} heading="No server selected" description="Select a mock server to browse its store." />
      </PageShell>
    );
  }

  if (collections.length === 0) {
    return (
      <PageShell center>
        <EmptyState icon={Database} heading="No collections" description="This server has no data collections yet." />
      </PageShell>
    );
  }

  const activeCol = collections.find((c) => c.name === crud.activeCollection);

  return (
    <PageShell noScroll>
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <CollectionList
          collections={collections}
          active={crud.activeCollection}
          onSelect={crud.selectCollection}
          onSeed={(name, count) => crud.seedCollection(server.serverId, name, count)}
          onClear={(name) => crud.clearCollection(server.serverId, name)}
        />

        {activeCol ? (
          <DataTable collection={activeCol} onSelectRecord={setSelectedRecord} />
        ) : (
          <div className="flex flex-1 items-center justify-center text-body-sm text-muted-foreground/50">
            Select a collection
          </div>
        )}

        {selectedRecord && activeCol && (
          <RecordDetail
            record={selectedRecord}
            collection={activeCol.name}
            onClose={() => setSelectedRecord(null)}
          />
        )}
      </div>
    </PageShell>
  );
}
