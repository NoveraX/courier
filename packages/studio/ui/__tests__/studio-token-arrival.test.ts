/**
 * @vitest-environment jsdom
 */
/**
 * A Studio link opened in a page that already shows Studio changes only the
 * page's fragment, so the page is not loaded again. The page takes the
 * link's token then, out of the address bar, and its socket connects again
 * to present it — once, for a token other than the page's.
 */
import type * as SocketIoClient from "socket.io-client";
import type { ManagerOptions, SocketOptions } from "socket.io-client";
import { expect, it, vi } from "vitest";

const handshakes = vi.hoisted(() => new Array<Partial<ManagerOptions & SocketOptions>>());

vi.mock("socket.io-client", async (importOriginal) => {
  const actual = await importOriginal<typeof SocketIoClient>();
  const socket = actual.io("http://127.0.0.1:9", { autoConnect: false });
  return {
    ...actual,
    io: (_uri: string, options: Partial<ManagerOptions & SocketOptions>) => {
      handshakes.push(options);
      return socket;
    },
  };
});

const { studioToken } = await import("@/lib/studio-token");
const { getSocket } = await import("@/socket/socket-instance");

const TOKEN = "n".repeat(43);

function handshakeOf(options: Partial<ManagerOptions & SocketOptions> | undefined): Promise<unknown> {
  const auth = options?.auth;
  if (typeof auth !== "function") return Promise.resolve(auth);
  return new Promise((resolve) => auth(resolve));
}

function open(link: string): Promise<unknown> {
  return new Promise((resolve) => {
    addEventListener("hashchange", resolve, { once: true });
    location.hash = link;
  });
}

it("takes a token a link brings later, and connects the socket again to present it", async () => {
  expect(studioToken()).toBeNull();
  const socket = getSocket();
  const reconnect = vi.spyOn(socket, "connect").mockReturnValue(socket);

  await open(`#token=${TOKEN}`);

  expect(studioToken()).toBe(TOKEN);
  expect(location.hash).toBe("");
  expect(reconnect).toHaveBeenCalledOnce();
  expect(await handshakeOf(handshakes[0])).toEqual({ token: TOKEN });

  await open(`#token=${TOKEN}`);

  expect(location.hash).toBe("");
  expect(reconnect).toHaveBeenCalledOnce();
});
