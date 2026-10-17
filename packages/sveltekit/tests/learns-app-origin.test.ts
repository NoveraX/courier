/**
 * The app's origin, learned from a request a SvelteKit route serves. The
 * dev server tells no port, so the address SvelteKit reports must be this
 * machine's; under adapter-node the socket's port must match too. A
 * request another machine sent teaches nothing.
 */
import { getAppOrigin, setAppOrigin } from "@noverax/courier";
import { courier, defineApi } from "@noverax/courier/define";
import { afterEach, describe, expect, it } from "vitest";

import { courierHandler, type SvelteKitRequestEvent } from "../src/index";

/* A source whose endpoint no mark opens: the call is refused before anything is sent. */
const { endpoint } = courier();
const api = defineApi({ baseURL: "http://127.0.0.1:9", endpoints: { ping: endpoint.get("ping") } });
const handler = courierHandler({ sources: { api } });

/* The event SvelteKit hands the route; adapter-node adds the Node request's socket. */
function event(host: string, address: string, localPort?: number): SvelteKitRequestEvent {
  const request = new Request("http://localhost/api/request?_s=api&_m=ping", { headers: { host } });
  const getClientAddress = () => address;
  if (localPort === undefined) return { request, getClientAddress };
  const socket = { localPort, destroyed: false, once: () => undefined, off: () => undefined };
  return { request, getClientAddress, platform: { req: { socket } } };
}

afterEach(() => {
  setAppOrigin(undefined);
});

describe("a SvelteKit route learning the app's origin", () => {
  it("learns from this machine, as the dev server serves", async () => {
    await handler(event("localhost:5173", "::1")).catch(() => undefined);

    expect(getAppOrigin()).toBe("http://localhost:5173");
  });

  it("learns on the socket's port under adapter-node, and nothing on another", async () => {
    await handler(event("localhost:7990", "127.0.0.1", 3000)).catch(() => undefined);
    expect(getAppOrigin()).toBeUndefined();

    await handler(event("[::1]:3000", "127.0.0.1", 3000)).catch(() => undefined);
    expect(getAppOrigin()).toBe("http://[::1]:3000");
  });

  it("learns nothing from another machine", async () => {
    await handler(event("localhost:5173", "192.168.1.20")).catch(() => undefined);

    expect(getAppOrigin()).toBeUndefined();
  });
});
