/**
 * A server-side caller's own headers against the ones it forwards.
 *
 * A caller given the incoming request forwards its allowed headers — the
 * end user's token, and their cookie where the source names it. Headers the caller sets itself, as a
 * default or for one call, are its explicit choice: a service token for a
 * backend the user may not reach directly. The forwarded ones used to be
 * written last and replaced them, so the service token never left.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createCaller } from "../src/caller";
import { courier, defineApi } from "../src/define/index";
import { echo, startUpstream, type Upstream } from "./helpers/upstream";

const { endpoint } = courier();
let upstream: Upstream;

beforeEach(async () => {
  upstream = await startUpstream(echo);
});

afterEach(async () => {
  await upstream.close();
});

function api() {
  return defineApi({
    name: "svc",
    baseURL: upstream.url,
    allowedHeaders: ["cookie"],
    endpoints: { me: endpoint.get("me") },
  });
}

const incoming = new Request("http://app.local/page", {
  headers: { authorization: "Bearer end-user", cookie: "session=abc" },
});

describe("a header the caller sets and the incoming request also carries", () => {
  it("is sent as the caller's default", async () => {
    const client = createCaller(api(), {
      context: { req: incoming },
      headers: { authorization: "Bearer default-service" },
    });

    await client.me();

    expect(upstream.received[0]?.headers.authorization).toBe("Bearer default-service");
  });

  it("is sent as the caller set it for one call", async () => {
    const client = createCaller(api(), { context: { req: incoming } });

    await client.with({ headers: { authorization: "Bearer per-call-service" } }).me();

    expect(upstream.received[0]?.headers.authorization).toBe("Bearer per-call-service");
  });
});

describe("a forwarded header the caller does not set", () => {
  it("still reaches the upstream", async () => {
    const client = createCaller(api(), {
      context: { req: incoming },
      headers: { authorization: "Bearer default-service" },
    });

    await client.me();

    expect(upstream.received[0]?.headers.cookie).toBe("session=abc");
  });

  it("stays behind when it is a cookie the source does not name", async () => {
    const unnamed = defineApi({ baseURL: upstream.url, endpoints: { me: endpoint.get("me") } });
    const client = createCaller(unnamed, { context: { req: incoming } });

    await client.me();

    expect(upstream.received[0]?.headers.cookie).toBeUndefined();
    expect(upstream.received[0]?.headers.authorization).toBe("Bearer end-user");
  });
});
