import {
  createFileRoute,
  Outlet,
  Link,
  useRouterState,
} from "@tanstack/react-router";
import {
  ChevronsLeftRightEllipsis,
  Database,
  Download,
  Eye,
} from "lucide-react";

import { useDevToolsStore } from "../store";
import { DisconnectedBanner } from "../components/ui";
import { ApisProvider, useApisContext } from "../views/apis/apis-context";
import { SourceTabs } from "../views/apis/apis-header";
import { ErrorBanner, WatchDiffBanner } from "../views/apis/apis-banners";

import type { Step } from "../views/apis/types";

function ApisLayout() {
  const { connectionStatus } = useDevToolsStore();

  return (
    <ApisProvider>
      <div className="flex h-full flex-col overflow-hidden">
        {connectionStatus === "disconnected" && <DisconnectedBanner />}
        <ApisToolbar />
        <ImportExtras />
        <div className="flex-1 overflow-auto p-4">
          <Outlet />
        </div>
      </div>
    </ApisProvider>
  );
}

function ApisToolbar() {
  const cg = useApisContext();
  const currentPath = useRouterState({ select: (s) => s.location.pathname });
  const isImport = currentPath.includes("/import");

  return (
    <div className="flex items-center justify-between border-b border-border-default px-4 py-2.5">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <ChevronsLeftRightEllipsis size={16} className="text-text-muted" />
          <span className="text-sm font-medium">APIs</span>
        </div>

        <div className="flex items-center rounded-md bg-surface-1 p-0.5">
          <TabLink to="/apis/registry" icon={Database} label="Registry" />
          <TabLink to="/apis/import" icon={Download} label="Import" />
        </div>

        {isImport && cg.st.spec && (
          <span className="text-xs text-text-muted">{cg.st.spec.title} v{cg.st.spec.version}</span>
        )}
      </div>

      <div className="flex items-center gap-2">
        {isImport && <ImportStepControls />}
      </div>
    </div>
  );
}

function TabLink({ to, icon: Icon, label }: { to: string; icon: typeof Database; label: string }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-1 rounded px-2 py-1 text-xs text-text-muted transition-colors hover:text-text-secondary"
      activeProps={{ className: "!bg-surface-2 !text-text-primary !shadow-sm" }}
    >
      <Icon size={11} />
      {label}
    </Link>
  );
}

function ImportStepControls() {
  const { st, src, watching, toggleWatch, step, setStep } = useApisContext();
  const steps: Step[] = ["import", "select", "options", "preview"];

  return (
    <>
      {st.spec && src.importSource === "url" && (
        <button
          type="button"
          onClick={toggleWatch}
          title={watching ? "Stop watching" : "Watch spec URL (10s)"}
          className={`flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors ${
            watching
              ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
              : "text-text-muted hover:text-text-secondary"
          }`}
        >
          <Eye size={12} className={watching ? "animate-pulse" : ""} />
          {watching ? "Watching" : "Watch"}
        </button>
      )}
      <div className="mx-1 h-4 w-px bg-border-subtle" />
      {steps.map((s, i) => (
        <button
          key={s}
          type="button"
          disabled={
            (s === "select" && !st.spec) ||
            (s === "options" && !st.spec) ||
            (s === "preview" && st.files.length === 0)
          }
          onClick={() => setStep(s)}
          className={`flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors ${
            step === s
              ? "bg-indigo-500/15 text-indigo-400"
              : "text-text-muted hover:text-text-secondary disabled:opacity-30"
          }`}
        >
          <span
            className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold ${
              step === s ? "bg-indigo-500 text-white" : "bg-surface-2 text-text-muted"
            }`}
          >
            {i + 1}
          </span>
          <span className="hidden sm:inline">{s.charAt(0).toUpperCase() + s.slice(1)}</span>
        </button>
      ))}
    </>
  );
}

function ImportExtras() {
  const cg = useApisContext();
  const currentPath = useRouterState({ select: (s) => s.location.pathname });
  const isImport = currentPath.includes("/import");

  if (!isImport) return null;

  return (
    <>
      <SourceTabs
        sources={cg.sources}
        states={cg.states}
        activeSourceIdx={cg.activeSourceIdx}
        onSwitch={cg.switchSource}
        onRemove={cg.removeSource}
        onAdd={cg.addSource}
      />
      {cg.error && <ErrorBanner error={cg.error} onDismiss={() => cg.setError(null)} />}
      {cg.watchDiff && (
        <WatchDiffBanner
          watchDiff={cg.watchDiff}
          st={cg.st}
          onReview={() => { cg.setWatchDiff(null); cg.setStep("select"); }}
          onDismiss={() => cg.setWatchDiff(null)}
        />
      )}
    </>
  );
}

export const Route = createFileRoute("/apis")({
  component: ApisLayout,
});
