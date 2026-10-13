/**
 * The user's address a call through the Nuxt proxy route tells its upstream
 * in `X-Forwarded-For`: the address h3 reports for the connection, the chain
 * a proxy in front recorded kept before it — from an h3 2.x event's request
 * and from the Node request an h3 1.x event wraps.
 */
import { courier, defineApi } from "@noverax/courier/define";
import { afterEach, describe, expect, it } from "vitest";

import { _resetSourcesForTests } from "../../core/src/sources";
import { echo, startUpstream, type Upstream } from "../../core/tests/helpers/upstream";
import { courierHandler } from "../src/index";
import { nuxtIncomingRequest } from "../src/request-context";

const { endpoint } = courier();

let upstream: Upstream | undefined;

afterEach(async () => {
  await upstream?.close();
  upstream = undefined;
  _resetSourcesForTests();
});

/* A request as srvx hands h3 2.x one: a Web request that reports its client's address. */
function srvxRequest(ip: string, forwardedFor: string): Request {
  const request = new Request("http://localhost:3000/api/request?_s=api&_m=ping", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": forwardedFor },
    body: JSON.stringify({}),
  });
  return Object.assign(request, { ip });
}

async function sources() {
  upstream = await startUpstream(echo);
  return { api: defineApi({ baseURL: upstream.url, endpoints: { ping: endpoint.post("ping") } }) };
}

describe("the Nuxt proxy route on h3 2.x", () => {
  it("names the user by the address h3 reports", async () => {
    const handler = courierHandler({ sources: await sources() });

    await handler({ req: srvxRequest("203.0.113.7", "6.6.6.6") });

    expect(upstream?.received[0]?.headers["x-forwarded-for"]).toBe("203.0.113.7");
  });

  it("keeps the chain the proxy in front recorded, and appends the proxy", async () => {
    const handler = courierHandler({ sources: await sources() });

    await handler({ req: srvxRequest("10.0.0.2", "198.51.100.23, 203.0.113.50") });

    expect(upstream?.received[0]?.headers["x-forwarded-for"]).toBe(
      "198.51.100.23, 203.0.113.50, 10.0.0.2",
    );
  });
});

describe("a page Nuxt renders on h3 2.x", () => {
  it("names the user the same way to the session", () => {
    const req = srvxRequest("10.0.0.2", "198.51.100.23, 203.0.113.50");

    expect(nuxtIncomingRequest({ req }).clientAddress).toBe(
      "198.51.100.23, 203.0.113.50, 10.0.0.2",
    );
  });
});
