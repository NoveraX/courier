import { connect, createServer, type Socket } from "node:net";

/** Why a mock could not listen on a port, or `null` when it could. */
export type PortProblem = "in use" | "not permitted" | null;

type Loopback = "127.0.0.1" | "::1";

const LOOPBACKS: readonly Loopback[] = ["127.0.0.1", "::1"];

/* A listener on a loopback accepts at once, and a port nothing listens on is
   refused at once — except on Windows, which retries the refused connection
   for about two seconds. A probe that has heard nothing by this time counts
   as unanswered rather than holding up every free port. */
const ANSWER_TIMEOUT_MS = 500;

/* Binding a loopback finds a process holding that very address, and a port
   this process may not bind. Dev servers asked for `localhost` often bind
   only [::1]; a system without IPv6 has nothing listening there. */
function bindProblem(port: number, host: Loopback): Promise<PortProblem> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") resolve("in use");
      else if (err.code === "EACCES") resolve("not permitted");
      else resolve(host === "::1" ? null : "in use");
    });
    server.once("listening", () => server.close(() => resolve(null)));
    server.listen({ port, host, ipv6Only: host === "::1" });
  });
}

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

/* Whether something accepts a connection on the loopback. A process
   listening on every address (`::`, or `0.0.0.0`) lets the binds above
   succeed on macOS, the BSDs and Windows, yet http://localhost:PORT reaches
   it rather than the mock. A connection sees it on every system; any error
   means nothing accepted one. One that is accepted is closed as a client
   closes it: what the other process sends is read and dropped, then the
   probe ends its side. Closing with data unread resets the connection, and a
   server that greets its clients can die of the reset. */
function answers(port: number, host: Loopback): Promise<boolean> {
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
 * Why a mock could not listen on a port now: another process holds it, on
 * a loopback or on every address, or it is a privileged port this process
 * may not bind.
 *
 * A port counts as free only when Studio can bind it on both loopbacks and
 * nothing answers a connection on either. Binding every address instead
 * would find the same listeners, but it makes the macOS and Windows
 * firewalls ask whether Node may accept incoming connections.
 *
 * @param port - The port to try
 * @returns The problem, or `null` when a mock can have the port to itself
 *
 * @example
 * ```ts
 * if ((await portProblem(7001)) === "in use") console.log("7001 is taken");
 * ```
 */
export async function portProblem(port: number): Promise<PortProblem> {
  const bound = (await bindProblem(port, "127.0.0.1")) ?? (await bindProblem(port, "::1"));
  if (bound !== null) return bound;
  const answered = await Promise.all(LOOPBACKS.map((host) => answers(port, host)));
  return answered.includes(true) ? "in use" : null;
}
