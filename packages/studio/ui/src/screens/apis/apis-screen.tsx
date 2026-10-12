import { toast } from "sonner";
import { useAskedImport } from "@/apis/use-asked-import";
import { useAskedManage } from "@/apis/use-asked-manage";
import { useImport } from "@/apis/use-import";
import { useManage } from "@/apis/use-manage";
import { useOpenApiExport } from "@/apis/use-openapi-export";
import { useRegistry } from "@/apis/use-registry";
import { useRemoveImport } from "@/apis/use-remove-import";
import { apiCardView, handWrittenRow } from "@/features/apis/api-card-view";
import { countScannedEndpoints } from "@/features/apis/helpers";
import { useNow } from "@/hooks/use-tick";
import { ApiCard } from "./api-card";
import { ApisHeader } from "./apis-header";
import { ApisSkeleton } from "./apis-skeleton";
import { ConfigNoticeBar, NoConfig, NoSources } from "./apis-states";
import { ExportOpenApiDialog } from "./export-openapi-dialog";
import { HandWrittenTable } from "./hand-written-table";
import { ImportDialog } from "./import/import-dialog";
import { ManageDialog } from "./manage/manage-dialog";
import { RemoveImportDialog } from "./remove-import-dialog";

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children: React.ReactNode;
}): React.ReactNode {
  return (
    <section aria-label={title} className="flex flex-col gap-3">
      <div className="flex items-baseline gap-2">
        <h2 className="m-0 text-ui font-semibold">{title}</h2>
        <span className="text-label text-fg-subtle">{note}</span>
      </div>
      {children}
    </section>
  );
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/**
 * The APIs page: the sources the project declares — imported from a spec,
 * each a card with its state and how typed it is, and written by hand, a
 * table — with a check for newer specs, a source's export as an OpenAPI
 * document, and Import API: a card a row and each hand-written source on
 * two lines on a phone.
 *
 * @returns The page
 * @example
 * ```tsx
 * <ApisScreen />
 * ```
 */
export function ApisScreen(): React.ReactNode {
  const registry = useRegistry();
  const now = useNow();
  const importWizard = useImport((message) => toast.success(message));
  useAskedImport(importWizard.openWizard, registry.page.importBlocked === null);
  const manageFlow = useManage((message) => toast.success(message));
  const removal = useRemoveImport((name, message) => {
    registry.forget(name);
    toast.success(message);
  });
  const exporter = useOpenApiExport();
  const { page, imported, handWritten, statuses } = registry;
  useAskedManage(
    manageFlow.start,
    imported.flatMap((source) => source.registry ?? []),
  );
  const names = [...imported, ...handWritten].map((source) => source.name);
  const loading = page.kind === "connecting" || page.kind === "loading";
  const checking = Object.values(statuses).some((s) => s.status === "checking");
  const endpoints = [...imported, ...handWritten].reduce(
    (sum, source) => sum + countScannedEndpoints(source),
    0,
  );
  const manage = (name: string): void => {
    const source = imported.find((s) => s.name === name);
    if (source?.registry) manageFlow.start(source.registry, registry.getNewSpec(name));
  };
  return (
    <>
      <div className="mx-auto flex w-full max-w-360 flex-col gap-5.5 px-6 pt-6 pb-12 max-sm:px-4 max-sm:pt-4">
        <ApisHeader
          summary={
            loading
              ? undefined
              : `${imported.length} imported · ${handWritten.length} hand-written · ${plural(endpoints, "endpoint")}`
          }
          check={{
            can: imported.length > 0,
            running: checking,
            onCheck: () => void registry.checkAll(),
          }}
          exporter={exporter}
          sources={names}
          importBlocked={page.importBlocked}
          onImport={() => importWizard.openWizard()}
        />
        {loading && <ApisSkeleton />}
        {page.kind === "no-config" && <NoConfig />}
        {page.kind === "broken" && <NoSources broken={page} />}
        {(page.kind === "sources" || page.kind === "empty") && page.notice && (
          <ConfigNoticeBar notice={page.notice} />
        )}
        {page.kind === "empty" && <NoSources />}
        {imported.length > 0 && (
          <Section title="Imported" note="generated from OpenAPI, Swagger or Postman specs">
            <div className="grid grid-cols-[repeat(auto-fill,minmax(min(300px,100%),1fr))] gap-3">
              {imported.map((source) => (
                <ApiCard
                  key={source.name}
                  card={apiCardView(source, statuses[source.name], now)}
                  onManage={() => manage(source.name)}
                  onCheck={() => void registry.checkUpdates(source.name)}
                  onRemove={() => void removal.start(source.name)}
                />
              ))}
            </div>
          </Section>
        )}
        {handWritten.length > 0 && (
          <Section title="Hand-written" note="detected in your source files">
            <HandWrittenTable rows={handWritten.map(handWrittenRow)} />
          </Section>
        )}
      </div>
      <ImportDialog wizard={importWizard} />
      <ManageDialog manage={manageFlow} />
      <RemoveImportDialog removal={removal} />
      <ExportOpenApiDialog exporter={exporter} sources={names} />
    </>
  );
}
