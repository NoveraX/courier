import { MAX_MESSAGE_BYTES } from "../max-message-bytes";
import { SpecTooLargeError } from "../spec-too-large-error";
import { runInThread } from "./run-in-thread";
import { SpecTextError } from "./spec-text-error";
import type { SpecReadJob } from "./spec-thread-protocol";
import { type ThreadBudget, TRUSTED_JOB, VISITOR_READ } from "./thread-budgets";
import { inThreadPlace } from "./thread-places";

/** A specification's text, and where it came from. */
export interface SpecSource {
  /** The text: pasted, fetched, or read from a file of the project. */
  text: string;
  /** The URL it was fetched from, which a relative server address is resolved against. */
  url?: string | undefined;
}

/** Whom a specification is read for, and what bounds and stops the read. */
export interface SpecReadOptions {
  /** Whether the caller holds the project's token. */
  trusted: boolean;
  /** Aborted once the caller goes away: the thread is ended, or the read leaves the line. */
  signal?: AbortSignal | undefined;
  /** The time and memory the read may take, instead of the caller's own. */
  budget?: ThreadBudget | undefined;
  /** The most the specification may be as JSON: what the caller can send back (default {@link MAX_MESSAGE_BYTES}). */
  maxBytes?: number | undefined;
}

/**
 * Read a specification's text in a thread of its own, as the parse route
 * answers it — parsed, its server address made absolute against the URL it
 * came from, as JSON — so that no text, however large and however its YAML
 * is shaped, holds up Studio's server. The thread is ended once the
 * specification is read, once it takes longer or more memory than its
 * budget, and once the caller goes away.
 *
 * A caller without the token is read for in one of the few places Studio
 * keeps for such callers, or refused while they are taken; a caller with
 * it waits its turn among the reads Studio runs at once for such callers.
 *
 * @param source - The text, and the URL it was fetched from
 * @param options - Whether the caller holds the project's token, its signal, its budget, and the most it can send back
 * @returns The specification as JSON
 * @throws {SpecTextError} When the text is no specification Studio reads
 * @throws {SpecTooLargeError} When the specification is larger, as JSON, than `maxBytes`
 * @throws {SpecWorkLimitError} When reading it takes longer or more memory than the budget
 * @throws {StudioBusyError} When Studio already works on as many for callers without the token as it takes
 * @throws {StudioThreadError} When Studio's thread script is from another build or missing, or the thread fails
 * @example
 * ```ts
 * const json = await readSpecInThread({ text, url }, { trusted, signal });
 * ```
 */
export async function readSpecInThread(
  { text, url }: SpecSource,
  { trusted, signal, budget, maxBytes = MAX_MESSAGE_BYTES }: SpecReadOptions,
): Promise<string> {
  const job: SpecReadJob = { kind: "spec:read", text, url, maxBytes };
  const within = budget ?? (trusted ? TRUSTED_JOB : VISITOR_READ);
  const reply = await inThreadPlace(trusted, signal, () => runInThread(job, within, signal));
  if ("json" in reply) return reply.json;
  if ("tooLarge" in reply) throw new SpecTooLargeError(reply.tooLarge, maxBytes);
  throw new SpecTextError(reply.refused);
}
