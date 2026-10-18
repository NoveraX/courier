import { createServer } from "node:net";

/* A port nothing listens on: one the system gave, and took back. */
async function closedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  if (address === null || typeof address === "string") throw new Error("no port was given");
  return address.port;
}

/**
 * Why a socket whose connection was refused failed, as Courier tells it on
 * this platform: the words the platform's WebSocket gives with its error —
 * Node 22's say why — or, where it gives none, as Node 24's and a browser's
 * do, the close it ended with.
 *
 * @returns The cause Studio is told
 * @example
 * ```ts
 * expect(reconnecting).toMatchObject({ cause: await refusedSocketCause() });
 * ```
 */
export async function refusedSocketCause(): Promise<{ message: string }> {
  const url = `ws://127.0.0.1:${await closedPort()}/`;
  const said = await new Promise<string>((resolve) => {
    const socket = new WebSocket(url);
    socket.onerror = (event) => {
      resolve("message" in event && typeof event.message === "string" ? event.message : "");
    };
  });
  return { message: said || "The socket closed with code 1006 before it opened" };
}
