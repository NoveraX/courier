/**
 * The app's origin, learned from a request a SolidStart route serves: the
 * port from the Node request under its h3 event, and the address SolidStart
 * reports. A Host on another port, or a request another machine sent,
 * teaches nothing.
 */
import { getAppOrigin, setAppOrigin } from "@noverax/courier";
import { courier, defineApi } from "@noverax/courier/define";
import { afterEach, describe, expect, it } from "vitest";

import { courierHandler } from "../src/index";

/* A source whose endpoint no mark opens: the call is refused before anything is sent. */
const { endpoint } = courier();
const api = defineApi({ baseURL: "http://127.0.0.1:9", endpoints: { ping: endpoint.get("ping") } });
const handler = courierHandler({ sources: { api } });

const event = (host: string, clientAddress: string, localPort: number) => ({
  request: new Request("http://localhost/api/request?_s=api&_m=ping", { headers: { host } }),
  clientAddress,
  nativeEvent: { node: { req: { socket: { localPort } } } },
});

afterEach(() => {
  setAppOrigin(undefined);
});

describe("a SolidStart route learning the app's origin", () => {
  it("learns on the port the server accepted the request on, from this machine", async () => {
    await handler(event("127.0.0.1:3000", "127.0.0.1", 3000)).catch(() => undefined);

    expect(getAppOrigin()).toBe("http://127.0.0.1:3000");
  });

  it("learns nothing from a Host on another port, or from another machine", async () => {
    await handler(event("localhost:7990", "127.0.0.1", 3000)).catch(() => undefined);
    await handler(event("localhost:3000", "203.0.113.9", 3000)).catch(() => undefined);

    expect(getAppOrigin()).toBeUndefined();
  });
});
