/**
 * A signal that aborts as soon as any of the given signals does, with that
 * signal's reason.
 *
 * `AbortSignal.any` does exactly this, and the Next.js Edge runtime does not
 * provide it: every SSE stream there answered 500 and every call with a
 * timeout failed as unreachable. Where the platform has it, it is used —
 * it also lets a combined signal be collected with its sources — and
 * elsewhere the signals are combined by hand, their listeners removed once
 * the combined signal has aborted.
 *
 * @param signals - The signals to follow
 * @returns A signal that aborts with the first of them
 *
 * @example
 * ```ts
 * const signal = anySignal([request.signal, AbortSignal.timeout(5_000)]);
 * ```
 */
export function anySignal(signals: readonly AbortSignal[]): AbortSignal {
  if (typeof AbortSignal.any === "function") return AbortSignal.any([...signals]);

  const controller = new AbortController();
  const already = signals.find((signal) => signal.aborted);
  if (already) {
    controller.abort(already.reason);
    return controller.signal;
  }

  const listeners = signals.map((signal) => {
    const listener = (): void => {
      for (const [source, handler] of listeners) source.removeEventListener("abort", handler);
      controller.abort(signal.reason);
    };
    return [signal, listener] as const;
  });
  for (const [signal, listener] of listeners) signal.addEventListener("abort", listener);
  return controller.signal;
}
