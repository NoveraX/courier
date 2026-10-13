import type { ParsedSpec } from "../apis";
import { MAX_MESSAGE_BYTES } from "./max-message-bytes";
import { isParsedSpec } from "./parsed-spec-guard";
import { TRUSTED_JOB } from "./spec-jobs/job-budgets";
import { inJobPlace } from "./spec-jobs/job-places";
import { runInProcess } from "./spec-jobs/run-in-process";
import type { SpecJobResult, SpecReadJob } from "./spec-jobs/spec-job-protocol";
import { SpecTextError } from "./spec-jobs/spec-text-error";
import { SpecTooLargeError } from "./spec-too-large-error";
import { SpecUnreadableError } from "./spec-unreadable-error";

/** What a process read of a specification: its JSON, or its size when too large; its hash either way. */
type SpecRead = Extract<SpecJobResult, { kind: "spec:read" }>;

/** The specification a URL answered with, as an update check reads it. */
export interface FetchedSpec {
  /** Its hash, which an update check compares with the one Studio recorded when it wrote the import. */
  readonly hash: string;
  /**
   * The specification itself, for a check that sends it on.
   *
   * @returns The specification
   * @throws {SpecTooLargeError} When it is larger, as JSON, than the check's caller can be sent
   */
  spec(): ParsedSpec;
}

/** What stops a read, and how much of the specification its caller can be sent. */
export interface FetchedSpecOptions {
  /** Aborted once whoever asked has gone: the read stops, or leaves the line. */
  signal?: AbortSignal | undefined;
  /** The most the specification may be as JSON to be sent on (default {@link MAX_MESSAGE_BYTES}); 0 when its hash alone is compared. */
  maxBytes?: number | undefined;
}

/**
 * Read the specification a URL answered with, its server address made
 * absolute against that URL, in a process of its own within the budget of
 * a caller with the project's token: what a host answers is text from the
 * network, and YAML shaped to take long to read must not hold up Studio's
 * server while it does. An answer that is no specification is the host's
 * failure, not Studio's: it is reported as such, with the reason.
 *
 * The process hashes the specification, so a check of one that did not
 * change needs none of it sent across, however large: only the
 * specification itself, asked for, is refused when its caller could not be
 * sent it.
 *
 * @param url - The URL that answered
 * @param raw - Its answer's text
 * @param options - What stops the read, and how much of the specification its caller can be sent
 * @returns Its hash, and the specification
 * @throws {SpecUnreadableError} When the answer is not a specification Studio reads
 * @throws {SpecWorkLimitError} When reading it takes longer or more memory than Studio gives one
 * @throws {StudioWorkerError} When Studio's worker script is from another build or missing, or the process fails
 * @throws The signal's reason, once it is aborted
 * @example
 * ```ts
 * const read = await readFetchedSpec(entry.from, raw, { signal: work.signal });
 * if (hasSpecChanged(state, name, read.hash)) res.json({ changed: true, newSpec: read.spec() });
 * ```
 */
export async function readFetchedSpec(
  url: string,
  raw: string,
  { signal, maxBytes = MAX_MESSAGE_BYTES }: FetchedSpecOptions = {},
): Promise<FetchedSpec> {
  const job: SpecReadJob = { kind: "spec:read", text: raw, url, maxBytes, hash: true };
  const reply = await inJobPlace(true, signal, () => runInProcess(job, TRUSTED_JOB, signal));
  if ("refused" in reply) throw new SpecUnreadableError(url, new SpecTextError(reply.refused));
  const { hash } = reply;
  if (hash === undefined) throw new Error(`Studio's process read ${url} without its hash.`);
  return { hash, spec: () => specOf(url, reply, maxBytes) };
}

function specOf(url: string, reply: SpecRead, maxBytes: number): ParsedSpec {
  if ("tooLarge" in reply) throw new SpecTooLargeError(reply.tooLarge, maxBytes);
  const spec: unknown = JSON.parse(reply.json);
  if (!isParsedSpec(spec))
    throw new Error(`Studio read ${url} into something other than a specification.`);
  return spec;
}
