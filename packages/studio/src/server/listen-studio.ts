import type { Server } from "node:http";
import { createLogger } from "@noverax/courier";
import { formatStudioUrl } from "@noverax/courier/config";
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
 * @param httpServer - Studio's HTTP server
 * @param options - Where to listen and whom to tell
 * @returns The address, read when needed
 */
export function listenStudio(httpServer: Server, options: ListenOptions): StudioAddress {
  const { port, host, onReady, onError } = options;
  let url = formatStudioUrl(host, port);
  let listeningOn: number | null = null;

  httpServer.once("error", (err: NodeJS.ErrnoException) => {
    const failure = err.code === "EADDRINUSE" ? new StudioPortInUseError(port, host, err) : err;
    if (onError) onError(failure);
    else log.error("Courier Studio could not start", failure);
  });

  httpServer.listen(port, host, () => {
    const address = httpServer.address();
    listeningOn = typeof address === "object" && address !== null ? address.port : port;
    url = formatStudioUrl(host, listeningOn);
    onReady?.(url);
  });

  return { url: () => url, port: () => listeningOn };
}
