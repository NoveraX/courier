/**
 * The user's address a call through the React Router proxy route tells its
 * upstream in `X-Forwarded-For`. A loader or an action is handed the
 * `Request` alone, so it is the chain the server or the platform in front
 * recorded, as it came.
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

async function call(headers: Record<string, string>) {
  upstream = await startUpstream(echo);
  const api = defineApi({ baseURL: upstream.url, endpoints: { ping: endpoint.post("ping") } });
  const request = new Request("http://localhost:5173/api/request?_s=api&_m=ping", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({}),
  });

  await courierHandler({ sources: { api } })({ request });

  return upstream.received[0]?.headers["x-forwarded-for"];
}

describe("the React Router proxy route", () => {
  it("passes on the chain the platform in front recorded", async () => {
    expect(await call({ "x-forwarded-for": "198.51.100.23, 203.0.113.50" })).toBe(
      "198.51.100.23, 203.0.113.50",
    );
  });

  it("names nobody when nothing recorded an address", async () => {
    expect(await call({ "x-real-ip": "6.6.6.6" })).toBeUndefined();
  });
});
