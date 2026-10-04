import type { ProcessStatus } from "@/store/mock-slice";
import { mockFailureReason } from "./mock-failure-reason";

/* A running mock with a problem kept its last good definition: the latest one could not be read. */
const OUTCOME: Partial<Record<ProcessStatus, string>> = {
  crashed: "is not running",
  running: "still serves its previous definition",
};

interface MockFailureNoteProps {
  serverId: string;
  status: ProcessStatus;
  lastError?: string | undefined;
}

/**
 * Why a managed mock is not serving as declared, said in the page rather
 * than only in its status badge's tooltip: why it crashed, or why it keeps
 * serving an older definition. Nothing when it reported no problem.
 *
 * @param props - The mock's key, its status and what it last reported
 * @returns The note, or `null`
 *
 * @example
 * ```tsx
 * <MockFailureNote serverId={server.serverId} status={server.processStatus} lastError={server.lastError} />
 * ```
 */
export function MockFailureNote({
  serverId,
  status,
  lastError,
}: MockFailureNoteProps): React.ReactElement | null {
  if (!lastError) return null;
  const reason = mockFailureReason(lastError);
  const outcome = OUTCOME[status] ?? "reported a problem";
  return (
    <p role="alert" className="text-body-xs text-rose-400" title={lastError}>
      <span className="mono-xs">mocks.{serverId}</span> {outcome}: {reason}
    </p>
  );
}
