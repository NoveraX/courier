/**
 * The user's address a call through the Astro proxy route tells its
 * upstream in `X-Forwarded-For`: the one Astro's adapter reports, the
 * chain the proxy in front of the application recorded kept before it.
 */
import { courier, defineApi } from "@noverax/courier/define";
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

/* An endpoint's context, its address a getter as Astro's is: one that throws where the adapter has none. */
function contextFor(request: Request, address: string | undefined) {
  return {
    request,
    get clientAddress(): string {
      if (address === undefined) throw new Error("clientAddress is not available in this adapter");
      return address;
    },
  };
}

async function call(address: string | undefined, forwardedFor: string) {
  upstream = await startUpstream(echo);
  const api = defineApi({ baseURL: upstream.url, endpoints: { ping: endpoint.post("ping") } });
  const request = new Request("http://localhost:4321/api/request?_s=api&_m=ping", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": forwardedFor },
    body: JSON.stringify({}),
  });

  await courierHandler({ sources: { api } })(contextFor(request, address));

  return upstream.received[0]?.headers["x-forwarded-for"];
}

describe("the Astro proxy route", () => {
  it("names the user by the address the adapter reports", async () => {
    expect(await call("203.0.113.7", "6.6.6.6")).toBe("203.0.113.7");
  });

  it("keeps the chain the proxy in front recorded, and appends the proxy", async () => {
    expect(await call("10.0.0.2", "6.6.6.6, 198.51.100.4")).toBe("6.6.6.6, 198.51.100.4, 10.0.0.2");
  });

  it("passes on the chain as it came where the adapter reports no address", async () => {
    expect(await call(undefined, "6.6.6.6, 198.51.100.4")).toBe("6.6.6.6, 198.51.100.4");
  });
});
