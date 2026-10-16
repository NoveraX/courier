/**
 * The app's origin, learned from a request a SvelteKit route serves: under
 * adapter-node, the address and port of the Node socket the request
 * arrived on, whatever Host it names. The dev server hands the route no
 * socket, so nothing is learned from its requests: Studio's Vite plugin
 * names the dev server the moment it starts.
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
function event(
  host: string,
  socket?: { localAddress: string; localPort: number },
): SvelteKitRequestEvent {
  const request = new Request("http://localhost/api/request?_s=api&_m=ping", { headers: { host } });
  const getClientAddress = () => "::1";
  if (socket === undefined) return { request, getClientAddress };
  const connection = { ...socket, destroyed: false, once: () => undefined, off: () => undefined };
  return { request, getClientAddress, platform: { req: { socket: connection } } };
}

afterEach(() => {
  setAppOrigin(undefined);
});

describe("a SvelteKit route learning the app's origin", () => {
  it("learns the address of adapter-node's socket, whatever Host the request names", async () => {
    await handler(event("evil.example:4444", { localAddress: "127.0.0.1", localPort: 3000 })).catch(
      () => undefined,
    );

    expect(getAppOrigin()).toBe("http://localhost:3000");
  });

  it("learns nothing from a request the dev server hands over, which carries no socket", async () => {
    await handler(event("localhost:5173")).catch(() => undefined);

    expect(getAppOrigin()).toBeUndefined();
  });
});
