import type { RequestEntry } from "@/store/types-request";

/**
 * What the reads another call's request answered come to, said after the
 * duplicate check passed: it is what kept identical calls from going out
 * twice.
 *
 * @param requests - The completed requests the audit read
 * @returns The sentence, or `undefined` when no read was shared
 * @example
 * ```ts
 * sharedReads(completed); // "1 identical read got its answer from a request another call made — …"
 * ```
 */
export function sharedReads(requests: readonly RequestEntry[]): string | undefined {
  const shared = requests.filter((r) => r.shared !== undefined).length;
  if (shared === 0) return undefined;
  const one = shared === 1;
  return `${shared} identical ${one ? "read" : "reads"} got ${one ? "its" : "their"} answer from a request another call made — in flight, or earlier in the render — and sent none of ${one ? "its" : "their"} own.`;
}
