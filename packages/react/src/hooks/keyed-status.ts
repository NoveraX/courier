import type { ConnectionStatus } from "@noverax/courier/realtime";
/* A namespace import, not named hooks: the package entry is reachable from
   Server Components, and Next.js refuses to build a server module that names
   a client-only hook such as useState among its imports. */
import * as React from "react";

/** The status an open stream or channel last reported, and the key naming it. */
export interface KeyedStatus {
  key: string;
  status: ConnectionStatus;
}

/** Records what an open stream or channel reports; `undefined` once it is closed. */
export type ReportStatus = (reported: KeyedStatus | undefined) => void;

/**
 * The status of the stream or channel a key names.
 *
 * What one reported belongs to it alone: another key is `connecting` until
 * its own first report, and a disabled one is `disconnected`, both in the
 * render that asks for them. Held as one status for the hook, a switch kept
 * showing the previous stream's `connected`, and a new one showed
 * `disconnected` while it was connecting.
 *
 * @param key - Names the stream or channel the hook has open
 * @param enabled - Whether the hook opens it at all
 * @returns The status to show, and what an open one reports through
 * @example
 * ```ts
 * const [status, report] = useKeyedStatus(key, enabled);
 * sub.on("status", (next) => report({ key, status: next }));
 * ```
 */
export function useKeyedStatus(key: string, enabled: boolean): [ConnectionStatus, ReportStatus] {
  const [reported, report] = React.useState<KeyedStatus | undefined>(undefined);
  if (!enabled) return ["disconnected", report];
  return [reported?.key === key ? reported.status : "connecting", report];
}
