import { createLogger } from "@noverax/courier";

const log = createLogger("Server");

/* A `kill`, an orchestrator's stop or Ctrl+C everywhere. On Windows also
   Ctrl+Break, and the console window closing, which the process outlives
   for a few seconds only. Elsewhere SIGHUP stays the host's: it may reload
   on it. */
const SIGNALS = ["SIGTERM", "SIGINT"] as const;
const WINDOWS_SIGNALS = [...SIGNALS, "SIGBREAK", "SIGHUP"] as const;

/** How each server listening for termination signals stops. */
const stops = new Set<() => Promise<void>>();

/* The signals the shared listener is on, fixed as the first server attaches. */
let listening: readonly NodeJS.Signals[] = [];

/**
 * Stop the server on SIGTERM or SIGINT — on Windows also on Ctrl+Break
 * (SIGBREAK) and on its console window closing (SIGHUP) — then end the
 * process, unless something else in it handles the signal too.
 *
 * A host that listens for the signal has taken the decision to end the
 * process from Node, and keeps it: ending the process when the server's own
 * drain finishes would cut short the host's flush or database close. With no
 * one else listening the server does what Node would have done at once, only
 * after draining. Every server in the process shares one listener, so the
 * first to finish does not end the process under the others either.
 *
 * Once a server starts stopping it stops listening, so a second signal gets
 * whatever else handles it — with nothing else, Node's immediate exit.
 *
 * @param stop - The server's graceful shutdown
 * @returns A function that stops listening for this server
 *
 * @example
 * ```ts
 * const detach = setupSignalHandlers(() => server.stop());
 * // later, when the server stops for another reason:
 * detach();
 * ```
 */
export function setupSignalHandlers(stop: () => Promise<void>): () => void {
  /* Prepended so it runs before any other listener, while a host's `once`
     handler is still registered and can be counted. */
  if (stops.size === 0) {
    listening = process.platform === "win32" ? WINDOWS_SIGNALS : SIGNALS;
    for (const signal of listening) process.prependListener(signal, onSignal);
  }
  stops.add(stop);

  return () => {
    if (!stops.delete(stop) || stops.size > 0) return;
    for (const signal of listening) process.off(signal, onSignal);
  };
}

function onSignal(signal: NodeJS.Signals): void {
  const hostHandles = process.listenerCount(signal) > 1;
  log.info(`Received ${signal}`);
  void stopAll().then((clean) => {
    if (!hostHandles) process.exit(clean ? 0 : 1);
  });
}

/** Stop every server, reporting each that failed; true when none did. */
async function stopAll(): Promise<boolean> {
  const results = await Promise.allSettled([...stops].map((stop) => stop()));
  let clean = true;
  for (const result of results) {
    if (result.status === "fulfilled") continue;
    clean = false;
    log.error("Server did not stop cleanly", result.reason);
  }
  return clean;
}
