import { CheckCircle2, Loader2 } from "lucide-react";
import { MockFailureNote } from "../shared/mock-failure-note";
import { ProcessStatusBadge, ServerControls } from "../shared/server-controls";
import type { MockWizardState } from "./types";
import { useMockArrival } from "./use-mock-arrival";
import { WarningList } from "./warning-list";

type Applied = Extract<MockWizardState["apply"], { status: "applied" }>;

interface DoneStepProps {
  applied: Applied;
  connected: boolean;
}

/**
 * The mocks Studio added, each as Studio lists it once it has loaded the
 * edited file: its status and controls, and where it listens while it
 * runs. Until then a mock shows as awaited; one still missing after the
 * patience runs out is reported, as is a lost connection to Studio, and
 * one that did not start says why.
 *
 * @param props - The apply's outcome, and whether the UI is connected
 * @returns The step
 *
 * @example
 * ```tsx
 * <DoneStep applied={state.apply} connected={connected} />
 * ```
 */
export function DoneStep({ applied, connected }: DoneStepProps): React.ReactElement {
  const { listed, pending, overdue } = useMockArrival(applied.keys, applied.at);
  return (
    <div className="space-y-4">
      <h3 className="flex items-center gap-2 text-h3">
        <CheckCircle2 className="size-3.5 text-emerald-400" />
        Added to {applied.target}
      </h3>
      <WarningList warnings={applied.warnings} />
      <ul
        aria-live="polite"
        className="divide-y divide-border-subtle rounded-lg border border-border-subtle"
      >
        {listed.map((server) => (
          <li key={server.serverId} className="flex h-10 items-center gap-2 px-3">
            <span className="mono-sm">mocks.{server.serverId}</span>
            <ProcessStatusBadge status={server.processStatus} lastError={server.lastError} />
            {server.processStatus === "running" && server.url && (
              <span className="truncate mono-xs text-muted-foreground">{server.url}</span>
            )}
            <div className="ml-auto">
              <ServerControls
                serverId={server.serverId}
                processStatus={server.processStatus}
                managed={server.managed}
              />
            </div>
          </li>
        ))}
        {pending.map((key) => (
          <li key={key} className="flex h-10 items-center gap-2 px-3 text-muted-foreground">
            <span className="mono-sm">mocks.{key}</span>
            <Loader2 className="size-3 animate-spin" />
            <span className="text-body-xs">Waiting for Studio to list it</span>
          </li>
        ))}
      </ul>
      {listed.map((server) => (
        <MockFailureNote
          key={server.serverId}
          serverId={server.serverId}
          status={server.processStatus}
          lastError={server.lastError}
        />
      ))}
      {!connected && (
        <p className="text-body-xs text-amber-400">
          Studio is disconnected; the mocks appear once it reconnects.
        </p>
      )}
      {connected && overdue && (
        <p className="text-body-xs text-amber-400">
          {applied.target} was saved and loads, but Studio has not listed{" "}
          {pending.map((key) => `mocks.${key}`).join(", ")} yet. Studio's terminal says why.
        </p>
      )}
    </div>
  );
}
