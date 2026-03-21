import { BookOpen } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/shared/empty-state";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { PageShell } from "@/components/shared/page-shell";

import { ApisHeader } from "./apis-header";
import { ImportWizard } from "./import-wizard";
import { ManageDialog } from "./manage-dialog";
import { RegistryCard } from "./registry-card";
import { ScannedCard } from "./scanned-card";
import { useImport } from "./use-import";
import { useManage } from "./use-manage";
import { useRegistry } from "./use-registry";

export function ApisView(): React.ReactElement {
  const registry = useRegistry();

  const importWizard = useImport(() => {
    toast.success("API imported successfully");
    void registry.refresh();
  });

  const manageFlow = useManage(() => {
    toast.success("Endpoints updated successfully");
    void registry.refresh();
  });

  const checking = Object.values(registry.statuses).some(
    (s) => s.status === "checking",
  );
  const isEmpty = registry.imported.length === 0 && registry.handWritten.length === 0;

  const handleManage = (name: string) => {
    const source = registry.imported.find((s) => s.name === name);
    if (!source?.registry) return;
    const newSpec = registry.getNewSpec(name);
    manageFlow.start(source.registry, newSpec);
  };

  return (
    <>
      <PageShell
        toolbar={
          <ApisHeader
            sourceCount={registry.imported.length}
            scannedCount={registry.handWritten.length}
            checking={checking}
            onImport={() => importWizard.openWizard()}
            onCheckAll={() => void registry.checkAll()}
          />
        }
        center={isEmpty && !registry.loading}
      >
        {registry.loading ? (
          <div className="p-5">
            <LoadingSkeleton layout="cards" />
          </div>
        ) : isEmpty ? (
          <EmptyState
            icon={BookOpen}
            heading="No APIs yet"
            description="Import an OpenAPI, Swagger, or Postman spec to generate typed API code. Or start writing APIs by hand — they'll appear here automatically."
            action={{
              label: "Import API",
              onClick: () => importWizard.openWizard(),
            }}
          />
        ) : (
          <div className="p-5 space-y-6">
            {registry.imported.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-caption text-muted-foreground">Imported</h2>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {registry.imported.map((source) => (
                    <RegistryCard
                      key={source.name}
                      source={source}
                      status={registry.statuses[source.name]}
                      onCheckUpdates={() => void registry.checkUpdates(source.name)}
                      onManage={() => handleManage(source.name)}
                      onRemove={() => void registry.remove(source.name)}
                    />
                  ))}
                </div>
              </section>
            )}

            {registry.handWritten.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-caption text-muted-foreground">Hand-written</h2>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {registry.handWritten.map((source) => (
                    <ScannedCard key={source.name} source={source} />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </PageShell>

      <ImportWizard wizard={importWizard} />
      <ManageDialog manage={manageFlow} />
    </>
  );
}
