import { Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useImport } from "@/apis/use-import";
import { useManage } from "@/apis/use-manage";
import { useRegistry } from "@/apis/use-registry";
import { useRemoveImport } from "@/apis/use-remove-import";
import { Skeleton } from "@/design/skeleton";
import { apiCardView, handWrittenRow } from "@/features/apis/api-card-view";
import { countScannedEndpoints } from "@/features/apis/helpers";
import { useNow } from "@/hooks/use-tick";
import { cn } from "@/lib/utils";
import { ApiCard } from "./api-card";
import { ApisSkeleton } from "./apis-skeleton";
import { ConfigNoticeBar, NoConfig, NoSources } from "./apis-states";
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
 * table — with a check for newer specs and Import API.
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
  const manageFlow = useManage((message) => toast.success(message));
  const removal = useRemoveImport((name, message) => {
    registry.forget(name);
    toast.success(message);
  });
  const { page, imported, handWritten, statuses } = registry;
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
      <div className="mx-auto flex w-full max-w-360 flex-col gap-5.5 px-6 pt-6 pb-12">
        <header className="flex flex-wrap items-end gap-3.5">
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="m-0 text-page font-semibold tracking-[-0.025em]">APIs</h1>
            {loading ? (
              <Skeleton className="my-0.75 h-3 w-64" />
            ) : (
              <span className="text-control text-fg-subtle">{`${imported.length} imported · ${handWritten.length} hand-written · ${plural(endpoints, "endpoint")}`}</span>
            )}
          </div>
          <div className="flex-1" />
          <button
            type="button"
            disabled={imported.length === 0 || checking}
            onClick={() => void registry.checkAll()}
            className="flex h-8 cursor-pointer items-center gap-1.75 rounded-card border border-line bg-panel px-3 text-control whitespace-nowrap text-fg-muted hover:border-line-strong hover:text-fg disabled:cursor-default disabled:opacity-50"
          >
            <RefreshCw aria-hidden="true" className={cn("size-3.25", checking && "animate-spin")} />
            {checking ? "Checking…" : "Check for updates"}
          </button>
          <button
            type="button"
            disabled={page.importBlocked !== null}
            title={page.importBlocked ?? undefined}
            onClick={() => importWizard.openWizard()}
            className="flex h-8 cursor-pointer items-center gap-1.75 rounded-card bg-fg px-3.25 text-control font-semibold whitespace-nowrap text-bg hover:bg-fg/90 disabled:cursor-default disabled:opacity-50"
          >
            <Plus aria-hidden="true" className="size-3.25" />
            Import API
          </button>
        </header>
        {loading && <ApisSkeleton />}
        {page.kind === "no-config" && <NoConfig />}
        {page.kind === "broken" && <NoSources broken={page} />}
        {(page.kind === "sources" || page.kind === "empty") && page.notice && (
          <ConfigNoticeBar notice={page.notice} />
        )}
        {page.kind === "empty" && <NoSources />}
        {imported.length > 0 && (
          <Section title="Imported" note="generated from OpenAPI, Swagger or Postman specs">
            <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3">
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
    </>
  );
}
