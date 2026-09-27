import { createLogger } from "@noverax/courier";

const log = createLogger("Server");

const SIGNALS = ["SIGTERM", "SIGINT"] as const;

/** How each server listening for termination signals stops. */
const stops = new Set<() => Promise<void>>();

/**
 * Stop the server on SIGTERM or SIGINT, then end the process — unless
 * something else in it handles the signal too.
 *
 * The process used to end the moment the server's own drain finished, which
 * cut short an embedding host's handler for the same signal: its flush or
 * its database close never completed. A host that listens for the signal has
 * taken the decision to end the process from Node, and now keeps it. With no
 * one else listening the server does what Node would have done at once, only
 * after draining. Every server in the process shares one listener, so the
 * first to finish no longer ends the process under the others either.
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
  if (stops.size === 0) for (const signal of SIGNALS) process.prependListener(signal, onSignal);
  stops.add(stop);

  return () => {
    if (!stops.delete(stop) || stops.size > 0) return;
    for (const signal of SIGNALS) process.off(signal, onSignal);
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
