import type { Server } from "node:http";
import { createLogger } from "@noverax/courier";
import { formatStudioUrl } from "@noverax/courier/config";
import { errnoCode } from "./errno-code";
import { listenLoopbackCompanion } from "./listen-loopback-companion";
import { StudioPortInUseError } from "./studio-port-in-use-error";

const log = createLogger("Studio");

export interface ListenOptions {
  port: number;
  host: string;
  onReady?: (url: string) => void;
  onError?: (error: Error) => void;
}

/** Where Studio listens, as far as it is known yet. */
export interface StudioAddress {
  /** The address the UI is served at; exact once listening. */
  url(): string;
  /** The port listened on, once listening. */
  port(): number | null;
}

/**
 * Start listening, reporting where once it does and why when it cannot.
 *
 * The address is known for certain only once listening: with port 0 the
 * system picks it, and the requested one would name an address nothing
 * answers at. A port another process holds is reported as that, and any
 * listen error reaches `onError` rather than the process.
 *
 * Bound to `localhost`, Studio listens on both loopback addresses,
 * `127.0.0.1` and `::1`. Bound to the name, it listened on whichever the
 * resolver gave first — `::1` on macOS — and refused a client that dialled
 * the other. It is ready once it listens on both, or on `127.0.0.1` alone
 * where the machine has no IPv6.
 *
 * @param httpServer - Studio's HTTP server
 * @param options - Where to listen and whom to tell
 * @returns The address, read when needed
 * @example
 * ```ts
 * const address = listenStudio(httpServer, { port: 6280, host: "localhost", onReady, onError });
 * ```
 */
export function listenStudio(httpServer: Server, options: ListenOptions): StudioAddress {
  const { port, host, onReady, onError } = options;
  let url = formatStudioUrl(host, port);
  let listeningOn: number | null = null;

  const fail = (err: Error, at: string): void => {
    const failure = errnoCode(err) === "EADDRINUSE" ? new StudioPortInUseError(port, at, err) : err;
    if (onError) onError(failure);
    else log.error("Courier Studio could not start", failure);
  };

  httpServer.once("error", (err: NodeJS.ErrnoException) => fail(err, host));

  const loopback = host.toLowerCase() === "localhost";
  httpServer.listen(port, loopback ? "127.0.0.1" : host, () => {
    const address = httpServer.address();
    const bound = typeof address === "object" && address !== null ? address.port : port;
    const ready = (): void => {
      listeningOn = bound;
      url = formatStudioUrl(host, bound);
      onReady?.(url);
    };
    if (!loopback) return ready();
    listenLoopbackCompanion(httpServer, bound, "::1").then(ready, (err: Error) => {
      httpServer.close();
      fail(err, "::1");
    });
  });

  return { url: () => url, port: () => listeningOn };
}
