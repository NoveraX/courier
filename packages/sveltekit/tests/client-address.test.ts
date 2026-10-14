/**
 * The user's address a call through the SvelteKit proxy route tells its
 * upstream in `X-Forwarded-For`: the one SvelteKit's adapter reports, the
 * chain the proxy in front of the application recorded kept before it.
 */
import { courier, defineApi } from "@noverax/courier/define";
import { afterEach, describe, expect, it } from "vitest";

import { _resetSourcesForTests } from "../../core/src/sources";
import { echo, startUpstream, type Upstream } from "../../core/tests/helpers/upstream";
import { courierHandler } from "../src/index";
import { svelteKitIncomingRequest } from "../src/request-context";

const { endpoint } = courier();

let upstream: Upstream | undefined;

afterEach(async () => {
  await upstream?.close();
  upstream = undefined;
  _resetSourcesForTests();
});

async function call(
  getClientAddress: (() => string) | undefined,
  forwardedFor?: string,
): Promise<string | string[] | undefined> {
  upstream = await startUpstream(echo);
  const api = defineApi({
    expose: true,
    baseURL: upstream.url,
    endpoints: { ping: endpoint.post("ping") },
  });
  const handler = courierHandler({ sources: { api } });
  const request = new Request("http://localhost:5173/api/request?_s=api&_m=ping", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(forwardedFor !== undefined && { "x-forwarded-for": forwardedFor }),
    },
    body: JSON.stringify({}),
  });

  await handler({ request, getClientAddress });

  return upstream.received[0]?.headers["x-forwarded-for"];
}

describe("the SvelteKit proxy route", () => {
  it("names the user by the address the adapter reports", async () => {
    expect(await call(() => "203.0.113.7", "6.6.6.6")).toBe("203.0.113.7");
  });

  it("keeps the chain the proxy in front recorded, and appends the proxy", async () => {
    expect(await call(() => "10.0.0.2", "6.6.6.6, 198.51.100.4")).toBe(
      "6.6.6.6, 198.51.100.4, 10.0.0.2",
    );
  });

  it("passes on the chain as it came where the adapter reports no address", async () => {
    const unknown = () => {
      throw new Error("Cannot call getClientAddress() during prerendering");
    };

    expect(await call(unknown, "6.6.6.6, 198.51.100.4")).toBe("6.6.6.6, 198.51.100.4");
  });
});

describe("a page SvelteKit renders", () => {
  it("names the user the same way to the session", () => {
    const event = {
      request: new Request("http://localhost:5173/", {
        headers: { "x-forwarded-for": "6.6.6.6, 198.51.100.4" },
      }),
      url: new URL("http://localhost:5173/"),
      cookies: { set: () => undefined },
      getClientAddress: () => "10.0.0.2",
    };

    expect(svelteKitIncomingRequest(event).clientAddress).toBe("6.6.6.6, 198.51.100.4, 10.0.0.2");
  });
});
