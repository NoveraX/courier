import { createServer, type Server } from "node:http";
import { createLogger } from "@noverax/courier";
import { errnoCode } from "./errno-code";

const log = createLogger("Studio");

/* What a machine without IPv6, or without that loopback address, reports. */
const UNAVAILABLE: ReadonlySet<string> = new Set(["EADDRNOTAVAIL", "EAFNOSUPPORT"]);

/**
 * Listen on a second loopback address, handing every request and upgrade
 * to `primary` — Express and Socket.IO alike — so one server answers at
 * both. The companion closes with `primary`.
 *
 * @param primary - The server Studio listens on
 * @param port - The port it listens on
 * @param address - The other loopback address, such as `::1`
 * @returns Once the companion listens, or at once when the machine has no such address
 * @throws The listen error, such as `EADDRINUSE`, for anything else
 * @example
 * ```ts
 * await listenLoopbackCompanion(httpServer, 6280, "::1");
 * ```
 */
export function listenLoopbackCompanion(
  primary: Server,
  port: number,
  address: string,
): Promise<void> {
  const companion = createServer((req, res) => primary.emit("request", req, res));
  companion.on("upgrade", (req, socket, head) => primary.emit("upgrade", req, socket, head));
  return new Promise<void>((resolve, reject) => {
    companion.once("error", (err: NodeJS.ErrnoException) => {
      const code = errnoCode(err);
      if (code === undefined || !UNAVAILABLE.has(code)) {
        reject(err);
        return;
      }
      log.debug(`Studio does not listen on ${address}: this machine has no such address (${code})`);
      resolve();
    });
    companion.listen(port, address, () => {
      primary.once("close", () => {
        companion.close();
        companion.closeAllConnections();
      });
      resolve();
    });
  });
}
