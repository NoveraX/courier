/**
 * The app's origin, learned from a request a Nuxt route serves: from the
 * socket under the event — h3 1.x's Node request, or the one h3 2.x's
 * request carries on Node — its port and peer. A Host on another port, or
 * a request another machine sent, teaches nothing.
 */
import { getAppOrigin, setAppOrigin } from "@noverax/courier";
import { courier, defineApi } from "@noverax/courier/define";
import { afterEach, describe, expect, it } from "vitest";
import type { H3EventLike } from "../src/h3-event";
import { courierHandler } from "../src/index";

/* A source whose endpoint no mark opens: the call is refused before anything is sent. */
const { endpoint } = courier();
const api = defineApi({ baseURL: "http://127.0.0.1:9", endpoints: { ping: endpoint.get("ping") } });
const handler = courierHandler({ sources: { api } });

/* An h3 2.x event on Node: its request carries the address and the Node request under it. */
function webEvent(host: string, ip: string, localPort: number): H3EventLike {
  const req = new Request("http://localhost/api/request?_s=api&_m=ping", { headers: { host } });
  Object.assign(req, { ip, runtime: { node: { req: { socket: { localPort } } } } });
  return { req };
}

afterEach(() => {
  setAppOrigin(undefined);
});

describe("a Nuxt route learning the app's origin", () => {
  it("learns on the port the server accepted the request on, from this machine", async () => {
    await handler(webEvent("localhost:3000", "::1", 3000)).catch(() => undefined);

    expect(getAppOrigin()).toBe("http://localhost:3000");
  });

  it("learns nothing from a Host on another port, or from another machine", async () => {
    await handler(webEvent("localhost:7990", "127.0.0.1", 3000)).catch(() => undefined);
    await handler(webEvent("localhost:3000", "192.168.1.20", 3000)).catch(() => undefined);

    expect(getAppOrigin()).toBeUndefined();
  });
});
