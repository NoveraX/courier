/**
 * The user's address a call through the Hono proxy route tells its upstream
 * in `X-Forwarded-For`: the address of the connection the runtime serving
 * Hono reports, the chain a proxy in front recorded kept before it.
 */
import { courier, defineApi } from "@noverax/courier/define";
import { Hono } from "hono";
import { afterEach, describe, expect, it } from "vitest";

import { _resetSourcesForTests } from "../../core/src/sources";
import { echo, startUpstream, type Upstream } from "../../core/tests/helpers/upstream";
import { courierHandler } from "../src/index";

const { endpoint } = courier();

let upstream: Upstream | undefined;

afterEach(async () => {
  await upstream?.close();
  upstream = undefined;
  _resetSourcesForTests();
});

/* A call as `@hono/node-server` hands it over: the Node request, its socket's address with it. */
async function call(remoteAddress: string, forwardedFor: string) {
  upstream = await startUpstream(echo);
  const api = defineApi({ baseURL: upstream.url, endpoints: { ping: endpoint.post("ping") } });
  const app = new Hono();
  app.post("/api/request", courierHandler({ sources: { api } }));

  await app.request(
    "/api/request?_s=api&_m=ping",
    {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": forwardedFor },
      body: JSON.stringify({}),
    },
    { incoming: { socket: { remoteAddress } } },
  );

  return upstream.received[0]?.headers["x-forwarded-for"];
}

describe("the Hono proxy route", () => {
  it("names the user by the connection's address, whatever it claims", async () => {
    expect(await call("203.0.113.7", "6.6.6.6")).toBe("203.0.113.7");
  });

  it("keeps the chain the proxy in front recorded, and appends the proxy", async () => {
    expect(await call("10.0.0.2", "198.51.100.23, 203.0.113.50")).toBe(
      "198.51.100.23, 203.0.113.50, 10.0.0.2",
    );
  });
});
