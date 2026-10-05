import type { Socket } from "socket.io-client";

/* Long enough for a mock to send a store of many records. */
const REPLY_TIMEOUT_MS = 10_000;

/**
 * Ask mocks for their store whole when the page's copy of one fell out of
 * step with the mock's reports of it: each mock once, until it answers. The
 * store comes back as a report every page takes.
 *
 * @param socket - The `/ui` socket
 * @returns Asks the mock it is given for its store
 * @example
 * ```ts
 * const askForStore = storeResender(socket);
 * if (!handleMockEvent(event)) askForStore("shop");
 * ```
 */
export function storeResender(socket: Socket): (serverId: string) => void {
  const asking = new Set<string>();
  return (serverId) => {
    if (asking.has(serverId)) return;
    asking.add(serverId);
    socket
      .timeout(REPLY_TIMEOUT_MS)
      .emit("mock:command", { action: "mock:store:resend", serverId }, () => {
        asking.delete(serverId);
      });
  };
}
