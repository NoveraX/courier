/**
 * The user's address a call through the SolidStart proxy route tells its
 * upstream in `X-Forwarded-For`: the one SolidStart reports, the chain
 * the proxy in front of the application recorded kept before it.
 */
import { courier, defineApi } from "@noverax/courier/define";
import { afterEach, describe, expect, it } from "vitest";

import { _resetSourcesForTests } from "../../core/src/sources";
import { echo, startUpstream, type Upstream } from "../../core/tests/helpers/upstream";
import { courierHandler } from "../src/index";
import { solidStartIncomingRequest } from "../src/request-context";

const { endpoint } = courier();

let upstream: Upstream | undefined;

afterEach(async () => {
  await upstream?.close();
  upstream = undefined;
  _resetSourcesForTests();
});

async function call(clientAddress: string | undefined, forwardedFor: string) {
  upstream = await startUpstream(echo);
  const api = defineApi({
    expose: true,
    baseURL: upstream.url,
    endpoints: { ping: endpoint.post("ping") },
  });
  const request = new Request("http://localhost:3000/api/request?_s=api&_m=ping", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": forwardedFor },
    body: JSON.stringify({}),
  });

  await courierHandler({ sources: { api } })({ request, clientAddress });

  return upstream.received[0]?.headers["x-forwarded-for"];
}

describe("the SolidStart proxy route", () => {
  it("names the user by the address SolidStart reports", async () => {
    expect(await call("203.0.113.7", "6.6.6.6")).toBe("203.0.113.7");
  });

  it("keeps the chain the proxy in front recorded, and appends the proxy", async () => {
    expect(await call("10.0.0.2", "6.6.6.6, 198.51.100.4")).toBe("6.6.6.6, 198.51.100.4, 10.0.0.2");
  });

  it("passes on the chain as it came where SolidStart reports no address", async () => {
    expect(await call(undefined, "6.6.6.6, 198.51.100.4")).toBe("6.6.6.6, 198.51.100.4");
  });
});

describe("a page SolidStart renders", () => {
  it("names the user the same way to the session", () => {
    const event = {
      request: new Request("http://localhost:3000/", {
        headers: { "x-forwarded-for": "6.6.6.6, 198.51.100.4" },
      }),
      response: { headers: new Headers() },
      clientAddress: "10.0.0.2",
    };

    expect(solidStartIncomingRequest(event).clientAddress).toBe("6.6.6.6, 198.51.100.4, 10.0.0.2");
  });
});
