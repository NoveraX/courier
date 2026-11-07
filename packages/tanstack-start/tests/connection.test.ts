/**
 * The connection a request came on, as the runtimes TanStack Start serves
 * on tell it: srvx on Node keeps Node's own request and its socket, srvx
 * on Bun and Deno tells the client's address as `ip`, and a request built
 * by hand — a test's, a Worker's — tells neither.
 */
import { describe, expect, it } from "vitest";

import { connectionOf } from "../src/connection";

const request = (extra: object): Request =>
  Object.assign(new Request("http://localhost:3000/api/request"), extra);

describe("connectionOf", () => {
  it("reads the socket of the Node request srvx keeps, and its peer", () => {
    const socket = { remoteAddress: "10.0.0.2", localAddress: "127.0.0.1", localPort: 3000 };

    const connection = connectionOf(request({ runtime: { node: { req: { socket } } } }));

    expect(connection).toEqual({ socket, address: "10.0.0.2" });
  });

  it("believes the socket over the address srvx takes from a proxy's header", () => {
    const socket = { remoteAddress: "10.0.0.2" };

    expect(
      connectionOf(request({ runtime: { node: { req: { socket } } }, ip: "203.0.113.7" })),
    ).toEqual({ socket, address: "10.0.0.2" });
  });

  it("takes the address srvx tells where there is no Node request", () => {
    expect(connectionOf(request({ ip: "198.51.100.4" }))).toEqual({
      socket: undefined,
      address: "198.51.100.4",
    });
  });

  it("tells nothing for a request that carries neither", () => {
    expect(connectionOf(new Request("http://localhost:3000/"))).toEqual({
      socket: undefined,
      address: undefined,
    });
  });
});
