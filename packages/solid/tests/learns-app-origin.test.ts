/**
 * The app's origin, learned from a request a SolidStart route serves: the
 * address and port of the Node socket under its h3 event, whatever Host the
 * request names. A socket that tells no address teaches nothing.
 */
import { getAppOrigin, setAppOrigin } from "@noverax/courier";
import { courier, defineApi } from "@noverax/courier/define";
import { afterEach, describe, expect, it } from "vitest";

import { courierHandler } from "../src/index";

/* A source whose endpoint no mark opens: the call is refused before anything is sent. */
const { endpoint } = courier();
const api = defineApi({ baseURL: "http://127.0.0.1:9", endpoints: { ping: endpoint.get("ping") } });
const handler = courierHandler({ sources: { api } });

const event = (host: string, socket: object) => ({
  request: new Request("http://localhost/api/request?_s=api&_m=ping", { headers: { host } }),
  clientAddress: "127.0.0.1",
  nativeEvent: { node: { req: { socket } } },
});

afterEach(() => {
  setAppOrigin(undefined);
});

describe("a SolidStart route learning the app's origin", () => {
  it("learns the address of the socket the request arrived on, whatever Host it names", async () => {
    await handler(event("evil.example:4444", { localAddress: "::1", localPort: 3000 })).catch(
      () => undefined,
    );

    expect(getAppOrigin()).toBe("http://localhost:3000");
  });

  it("learns nothing from a socket that tells no address", async () => {
    await handler(event("localhost:3000", {})).catch(() => undefined);

    expect(getAppOrigin()).toBeUndefined();
  });
});
