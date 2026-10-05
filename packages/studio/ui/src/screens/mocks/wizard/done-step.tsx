import { CheckCircle2, Loader2 } from "lucide-react";

import { mockFailureReason } from "@/features/mocks/mock-failure-reason";
import type { MockWizardState } from "@/features/mocks/wizard/types";
import { cn } from "@/lib/utils";
import { manageMock } from "@/mocks/manage-mock";
import { useMockArrival } from "@/mocks/wizard/use-mock-arrival";
import type { MockServerInfo } from "@/store/mock-slice";
import { PROCESS_STATUS } from "../process-status";
import { WarningNotes } from "./wizard-notes";

type Applied = Extract<MockWizardState["apply"], { status: "applied" }>;

/* A running mock with a problem kept its last good definition: the latest one could not be read. */
const OUTCOME: Partial<Record<MockServerInfo["processStatus"], string>> = {
  crashed: "is not running",
  running: "still serves its previous definition",
};

function ArrivedRow({ server }: { server: MockServerInfo }): React.ReactNode {
  const status = PROCESS_STATUS[server.processStatus];
  const running = server.processStatus === "running";
  const settled =
    running ||
    server.processStatus === "stopped" ||
    server.processStatus === "declared" ||
    server.processStatus === "crashed";
  return (
    <li className="flex h-10 items-center gap-2.5 border-b border-line px-3 last:border-b-0">
      <span className="font-mono text-control">mocks.{server.serverId}</span>
      <span className={cn("flex items-center gap-1.5 text-small font-medium", status.className)}>
        <span
          className={cn("size-1.75 rounded-full bg-current", status.pulse && "animate-pulse")}
        />
        {status.label}
      </span>
      {running && server.url && (
        <span className="truncate font-mono text-small text-fg-subtle">{server.url}</span>
      )}
      {server.managed && (
        <button
          type="button"
          disabled={!settled}
          onClick={() => manageMock(server.serverId, running ? "stop" : "start")}
          className="ml-auto flex h-6.5 shrink-0 cursor-pointer items-center rounded-[6px] border border-line px-2.25 text-small text-fg-muted hover:border-line-strong hover:text-fg disabled:cursor-default disabled:opacity-40"
        >
          {running ? "Stop" : "Start"}
        </button>
      )}
    </li>
  );
}

/**
 * The Done step: the file the mocks were added to, its warnings, and each
 * new mock as Studio lists it — with its state, address and Start or Stop —
 * or, until then, waiting for it, and what to look at when it is late.
 *
 * @param props - The apply that added them, and whether Studio is connected
 * @returns The step
 * @example
 * ```tsx
 * <DoneStep applied={state.apply} connected />
 * ```
 */
export function DoneStep({
  applied,
  connected,
}: {
  applied: Applied;
  connected: boolean;
}): React.ReactNode {
  const { listed, pending, overdue } = useMockArrival(applied.keys, applied.at);
  return (
    <div className="flex flex-col gap-3.5">
      <h3 className="flex items-center gap-2 text-title font-semibold">
        <CheckCircle2 aria-hidden="true" className="size-4 text-ok" />
        Added to {applied.target}
      </h3>
      <WarningNotes warnings={applied.warnings} />
      <ul
        aria-live="polite"
        className="m-0 list-none overflow-hidden rounded-[11px] border border-line p-0"
      >
        {listed.map((server) => (
          <ArrivedRow key={server.serverId} server={server} />
        ))}
        {pending.map((key) => (
          <li
            key={key}
            className="flex h-10 items-center gap-2.5 border-b border-line px-3 text-fg-subtle last:border-b-0"
          >
            <span className="font-mono text-control">mocks.{key}</span>
            <Loader2 aria-hidden="true" className="size-3 animate-spin" />
            <span className="text-small">Waiting for Studio to list it</span>
          </li>
        ))}
      </ul>
      {listed.map((server) =>
        server.lastError ? (
          <p
            key={server.serverId}
            role="alert"
            title={server.lastError}
            className="text-small text-err"
          >
            <span className="font-mono">mocks.{server.serverId}</span>{" "}
            {OUTCOME[server.processStatus] ?? "reported a problem"}:{" "}
            {mockFailureReason(server.lastError)}
          </p>
        ) : null,
      )}
      {!connected && (
        <p className="text-small text-warn">
          Studio is disconnected; the mocks appear once it reconnects.
        </p>
      )}
      {connected && overdue && (
        <p className="text-small text-warn">
          {applied.target} was saved and loads, but Studio has not listed{" "}
          {pending.map((key) => `mocks.${key}`).join(", ")} yet. Studio's terminal says why.
        </p>
      )}
    </div>
  );
}
