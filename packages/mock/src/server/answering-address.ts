import { connect, type Socket } from "node:net";

/* A listener accepts a connection on this machine at once, and a port nothing
   listens on is refused at once — except on Windows, which retries the
   refused connection for about two seconds. A probe that has heard nothing
   by this time counts as unanswered rather than holding up every free port. */
const ANSWER_TIMEOUT_MS = 500;

/* After the process was busy for longer than the timeout, the timeout runs
   before the event loop polls the socket, so a connection accepted meanwhile,
   or only just begun, has not been seen yet. A probe still connecting when
   its timeout runs is given up only once the loop has waited on it this much
   longer. */
const GRACE_MS = 50;

/* A probe that connected and then idled for the timeout is closed. */
function timedOut(socket: Socket, giveUp: () => void): void {
  if (!socket.connecting) {
    socket.destroy();
    return;
  }
  setTimeout(() => {
    if (socket.connecting) giveUp();
  }, GRACE_MS);
}

/* Any error means nothing accepted the connection. One that is accepted is
   closed as a client closes it: what the other process sends is read and
   dropped, then the probe ends its side. Closing with data unread resets the
   connection, and a server that greets its clients can die of the reset. */
function answers(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ port, host, timeout: ANSWER_TIMEOUT_MS });
    const giveUp = (): void => {
      socket.destroy();
      resolve(false);
    };
    socket.once("connect", () => {
      resolve(true);
      socket.resume();
      socket.end();
    });
    socket.on("timeout", () => timedOut(socket, giveUp));
    socket.on("error", giveUp);
  });
}

/**
 * The first of `hosts` at which something already accepts connections on
 * `port`.
 *
 * A bind cannot tell: on macOS, the BSDs and Windows, binding 127.0.0.1
 * succeeds beside another process listening on every address (`::`, or
 * `0.0.0.0`), which then answers `http://localhost:PORT` in the mock's
 * place. A connection sees that listener on every system.
 *
 * @param port - The port about to be listened on
 * @param hosts - The addresses clients of the server will connect to
 * @returns The first host something answers at, or `null` when none does
 *
 * @example
 * ```ts
 * const taken = await answeringAddress(7001, ["127.0.0.1", "::1"]);
 * if (taken !== null) throw new Error(`Another process answers at ${taken}:7001`);
 * ```
 */
export async function answeringAddress(
  port: number,
  hosts: readonly string[],
): Promise<string | null> {
  const answered = await Promise.all(hosts.map((host) => answers(port, host)));
  return hosts.find((_, index) => answered[index]) ?? null;
}
