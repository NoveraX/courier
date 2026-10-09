import type { PlaygroundAnswer } from "./playground-in-flight";
import type { SanitizedChunk } from "./runtime-playground-chunk-sanitize";

/** What came of a call Studio ran itself: what the runtime answered, or why nothing was. */
export type PlaygroundRunOutcome =
  | {
      readonly ok: true;
      /** What the runtime sent, in order: an HTTP call's is its one result. */
      readonly chunks: readonly SanitizedChunk[];
      readonly durationMs: number;
    }
  | { readonly ok: false; readonly message: string };

/** How a run is started, stopped, and given up on. */
export interface RunControls {
  /** Sends the call, with what hands each answer back. */
  readonly start: (deliver: (answer: PlaygroundAnswer) => void) => void;
  /** Stops the call at the runtime. */
  readonly cancel: () => void;
  readonly signal?: AbortSignal | undefined;
}

/**
 * Follow one call Studio sends a runtime itself, to its end: the chunks the
 * runtime answers with are gathered until it says the call ended, an error
 * ends it with its message, and a signal that aborts stops it at the
 * runtime and ends it at once.
 *
 * @param controls - What starts the call, what stops it, and the signal
 * @returns The runtime's chunks and how long the call took, or why it ended without them
 * @example
 * ```ts
 * const outcome = await collectRun({ start: (deliver) => send(id, deliver, call), cancel, signal });
 * ```
 */
export function collectRun({ start, cancel, signal }: RunControls): Promise<PlaygroundRunOutcome> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve({ ok: false, message: "The call was cancelled before it was sent" });
      return;
    }
    const chunks: SanitizedChunk[] = [];
    const onAbort = (): void => {
      cancel();
      resolve({ ok: false, message: "The call was cancelled" });
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    start((answer) => {
      if (answer.event === "playground:chunk") {
        chunks.push(answer.payload.chunk);
        return;
      }
      signal?.removeEventListener("abort", onAbort);
      resolve(
        answer.event === "playground:end"
          ? { ok: true, chunks, durationMs: answer.payload.summary.durationMs }
          : { ok: false, message: answer.payload.error.message },
      );
    });
  });
}
