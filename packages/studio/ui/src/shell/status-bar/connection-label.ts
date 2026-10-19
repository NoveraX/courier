import type { BindingSnapshot, ConnectionStatus } from "@/store/types-ui";

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? "" : "s"}`;

/** What the connection's segment says when the pointer rests on it: what its counts count. */
export const CONNECTION_TITLE =
  "Runtimes: the parts of your app attached to Studio, its server and its browser. Sources: the APIs they serve through a route. An app in the browser that calls its APIs directly serves none, and its calls show all the same.";

/**
 * What the status bar says about Studio's connection: the runtimes
 * attached and the sources they serve — or, where only browsers are
 * attached and serve none, that they call their APIs directly, which is
 * no fault — that Studio waits for an app, or what it does about a
 * connection lost. Until Studio has said which apps are attached, the
 * page is still connecting.
 *
 * @param status - The connection's state
 * @param snapshot - The runtimes attached, and what they serve; `null` until Studio has said
 * @returns The words
 * @example
 * ```ts
 * connectionLabel("connected", { runtimeCount: 2, sourceCount: 1, runtimes, rows: [] }); // "2 runtimes · 1 source"
 * ```
 */
export function connectionLabel(
  status: ConnectionStatus,
  snapshot: Pick<BindingSnapshot, "runtimeCount" | "sourceCount" | "runtimes"> | null,
): string {
  if (status === "reconnecting") return "reconnecting…";
  if (status === "disconnected") return "disconnected";
  if (status === "connecting" || snapshot === null) return "connecting…";
  const { runtimeCount, sourceCount, runtimes } = snapshot;
  if (runtimeCount === 0) return "waiting for an app";
  const browsers = runtimes.length > 0 && runtimes.every((runtime) => runtime.kind === "browser");
  const served = sourceCount === 0 && browsers ? "direct calls" : plural(sourceCount, "source");
  return `${plural(runtimeCount, "runtime")} · ${served}`;
}
