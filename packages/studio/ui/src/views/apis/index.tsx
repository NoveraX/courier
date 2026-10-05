import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useImport } from "@/apis/use-import";
import { useRegistry } from "@/apis/use-registry";
import { EmptyState } from "@/components/shared/empty-state";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { PageShell } from "@/components/shared/page-shell";
import { ApisEmptyState } from "./apis-empty-state";
import { ApisHeader } from "./apis-header";
import { ConfigNotice } from "./config-notice";
import { ImportWizard } from "./import-wizard";
import { ManageDialog } from "./manage-dialog";
import { NoConfigState } from "./no-config-state";
import { RegistryCard } from "./registry-card";
import { RemoveImportDialog } from "./remove-import-dialog";
import { ScannedCard } from "./scanned-card";
import { useManage } from "./use-manage";
import { useRemoveImport } from "./use-remove-import";

export function ApisView(): React.ReactElement {
  const registry = useRegistry();
  const { page } = registry;

  const importWizard = useImport((message) => {
    toast.success(message);
  });

  const manageFlow = useManage((message) => {
    toast.success(message);
  });

  const removal = useRemoveImport((name, message) => {
    registry.forget(name);
    toast.success(message);
  });

  const checking = Object.values(registry.statuses).some((s) => s.status === "checking");
  const importAction =
    page.importBlocked === null
      ? { label: "Import API", onClick: () => importWizard.openWizard() }
      : undefined;
  const centered =
    page.kind === "no-config" ||
    page.kind === "broken" ||
    (page.kind === "empty" && page.notice === null);
  const emptyState = <ApisEmptyState action={importAction} />;

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
            importBlocked={page.importBlocked}
            onImport={() => importWizard.openWizard()}
            onCheckAll={() => void registry.checkAll()}
          />
        }
        center={centered}
      >
        {page.kind === "connecting" || page.kind === "loading" ? (
          <div className="p-5">
            {page.kind === "loading" && (
              <p className="px-4 text-body-sm text-muted-foreground">Loading courier.config…</p>
            )}
            <LoadingSkeleton layout="cards" />
          </div>
        ) : page.kind === "no-config" ? (
          <NoConfigState />
        ) : page.kind === "broken" ? (
          <EmptyState
            icon={AlertTriangle}
            heading={`${page.configFile} does not load`}
            description={page.message}
          />
        ) : page.kind === "empty" && page.notice === null ? (
          emptyState
        ) : (
          <div className="p-5 space-y-6">
            {page.notice && <ConfigNotice notice={page.notice} />}
            {page.kind === "empty" && emptyState}
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
                      onRemove={() => void removal.start(source.name)}
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
      <RemoveImportDialog removal={removal} />
    </>
  );
}
