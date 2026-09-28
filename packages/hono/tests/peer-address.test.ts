import type { Context } from "hono";
import { describe, expect, it } from "vitest";

import { peerAddressOf } from "../src/peer-address";

const request = new Request("http://app.test/api/ws");

/** A context whose `env` is what the named runtime passes Hono. */
function contextWith(env: unknown): Context {
  return { env, req: { raw: request } } as unknown as Context;
}

describe("peerAddressOf", () => {
  it("reads the socket of the Node request @hono/node-server passes", () => {
    const env = { incoming: { socket: { remoteAddress: "203.0.113.7" } } };

    expect(peerAddressOf(contextWith(env))).toBe("203.0.113.7");
  });

  it("reads the Node request behind @hono/node-server's HTTP/2 bindings", () => {
    const env = { server: { incoming: { socket: { remoteAddress: "203.0.113.8" } } } };

    expect(peerAddressOf(contextWith(env))).toBe("203.0.113.8");
  });

  it("asks Bun's server for the address of this request", () => {
    const env = {
      requestIP: (asked: Request) => (asked === request ? { address: "198.51.100.4" } : null),
    };

    expect(peerAddressOf(contextWith(env))).toBe("198.51.100.4");
  });

  it("reads Deno's remote address", () => {
    const env = { remoteAddr: { hostname: "192.0.2.9", port: 443, transport: "tcp" } };

    expect(peerAddressOf(contextWith(env))).toBe("192.0.2.9");
  });

  it("has no address where the runtime reports none", () => {
    expect(peerAddressOf(contextWith({ ASSETS: {} }))).toBeUndefined();
    expect(peerAddressOf(contextWith(undefined))).toBeUndefined();
  });
});
