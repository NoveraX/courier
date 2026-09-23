/** Whether the server came up, as a promise and the two functions that settle it. */
export interface Readiness {
  /** Resolves with the URL once listening; rejects if the server cannot start. */
  ready: Promise<string>;
  markListening: (url: string) => void;
  markFailed: (error: Error) => void;
}

/**
 * Create the `ready` promise a server settles once it listens or fails to.
 *
 * @returns The promise and the functions that settle it
 *
 * @example
 * ```ts
 * const { ready, markListening } = createReadiness();
 * server.listen(port, () => markListening(url));
 * ```
 */
export function createReadiness(): Readiness {
  let markListening: (url: string) => void = () => {};
  let markFailed: (error: Error) => void = () => {};
  const ready = new Promise<string>((resolve, reject) => {
    markListening = resolve;
    markFailed = reject;
  });
  /* A caller that never inspects `ready` must not bring the process down with
     an unhandled rejection. Attaching a handler here marks it handled; anyone
     who does await it still receives the error. */
  ready.catch(() => {});
  return { ready, markListening, markFailed };
}
