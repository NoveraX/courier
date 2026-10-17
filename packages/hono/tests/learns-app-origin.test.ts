/**
 * The app's origin, learned from a request a Hono route serves, from what
 * the runtime serving Hono reports: the socket's port and peer under
 * `@hono/node-server`, the listening port and peer under Bun, the peer
 * alone under Deno. A Host on another port, or a request another machine
 * sent, teaches nothing.
 */
import { getAppOrigin, setAppOrigin } from "@noverax/courier";
import { courier, defineApi } from "@noverax/courier/define";
import { Hono } from "hono";
import { afterEach, describe, expect, it } from "vitest";

import { courierHandler } from "../src/index";

/* A source whose endpoint no mark opens: the call is refused before anything is sent. */
const { endpoint } = courier();
const api = defineApi({ baseURL: "http://127.0.0.1:9", endpoints: { ping: endpoint.get("ping") } });
const app = new Hono();
app.all("/api/request", courierHandler({ sources: { api } }));

const send = (host: string, env: object) =>
  app.request("http://localhost/api/request?_s=api&_m=ping", { headers: { host } }, env);
const nodeServer = (remoteAddress: string, localPort: number) => ({
  incoming: { socket: { remoteAddress, localPort } },
});

afterEach(() => {
  setAppOrigin(undefined);
});

describe("a Hono route learning the app's origin", () => {
  it("learns on the socket's own port from this machine, under @hono/node-server", async () => {
    await send("127.0.0.1:8787", nodeServer("127.0.0.1", 8787));

    expect(getAppOrigin()).toBe("http://127.0.0.1:8787");
  });

  it("learns on the port Bun listens on", async () => {
    await send("[::1]:3000", { requestIP: () => ({ address: "::1" }), port: 3000 });

    expect(getAppOrigin()).toBe("http://[::1]:3000");
  });

  it("learns from this machine alone under Deno, which tells no port", async () => {
    await send("localhost:8000", { remoteAddr: { hostname: "127.0.0.1" } });

    expect(getAppOrigin()).toBe("http://localhost:8000");
  });

  it("learns nothing from a Host on another port, or from another machine", async () => {
    await send("localhost:7990", nodeServer("127.0.0.1", 8787));
    await send("localhost:8787", nodeServer("192.168.1.20", 8787));
    await send("localhost:3000", {});

    expect(getAppOrigin()).toBeUndefined();
  });
});
