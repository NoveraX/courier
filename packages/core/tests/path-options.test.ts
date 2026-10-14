/**
 * Path parameters a server derives from its own context.
 *
 * `pathOptions` exists for values the caller must not choose — the tenant a
 * session belongs to, read from its cookie — so a variable of the same name
 * never replaces it: a browser naming another tenant would reach that
 * tenant's data with the server's credentials.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createHandler } from "../src/adapter";
import { createCaller } from "../src/caller";
import { courier, defineApi, defineGroup } from "../src/define/index";
import { HTTPError } from "../src/errors";
import { _resetSourcesForTests, registerSources } from "../src/sources";
import { echo, startUpstream, type Upstream } from "./helpers/upstream";

const { endpoint } = courier();
let upstream: Upstream;

beforeEach(async () => {
  upstream = await startUpstream(echo);
});

afterEach(async () => {
  _resetSourcesForTests();
  await upstream.close();
});

function tenantApi() {
  return defineApi({
    expose: true,
    name: "tenant",
    baseURL: upstream.url,
    pathOptions: (req) => ({ orgId: req?.headers.get("cookie")?.match(/orgId=([^;]+)/)?.[1] }),
    groups: {
      invoices: defineGroup({
        prefix: "orgs/:orgId/invoices",
        endpoints: {
          list: endpoint.get(""),
          byId: endpoint.get(":id").variables<{ id: string }>(),
        },
      }),
    },
  });
}

function proxyRequest(variables: Record<string, unknown>, cookie?: string): Request {
  return new Request("http://app.localhost/api/request?_s=tenant&_g=invoices&_m=list", {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie && { cookie }) },
    body: JSON.stringify({ variables }),
  });
}

describe("a path parameter pathOptions provides", () => {
  it("keeps the server's value when a proxy caller names another", async () => {
    registerSources({ tenant: tenantApi() });

    const response = await createHandler().handlePost(proxyRequest({ orgId: "999" }, "orgId=42"));

    expect(response.status).toBe(200);
    expect(upstream.received.map((r) => r.url)).toEqual(["/orgs/42/invoices"]);
  });

  it("keeps the server's value when a direct caller names another", async () => {
    const request = new Request("http://app.localhost/", { headers: { cookie: "orgId=42" } });
    const client = createCaller(tenantApi(), { context: { req: request } });

    await client.invoices.byId({ id: "5", orgId: "999" } as { id: string });

    expect(upstream.received.map((r) => r.url)).toEqual(["/orgs/42/invoices/5"]);
  });

  it("refuses the call when the server has no value, rather than taking the caller's", async () => {
    registerSources({ tenant: tenantApi() });

    const response = await createHandler().handlePost(proxyRequest({ orgId: "999" }));

    expect(response.status).toBe(400);
    expect(upstream.received).toEqual([]);
  });

  it("does not forward the caller's variable of that name upstream", async () => {
    registerSources({ tenant: tenantApi() });

    await createHandler().handlePost(proxyRequest({ orgId: "999", q: "x" }, "orgId=42"));

    expect(upstream.received[0]?.url).toBe("/orgs/42/invoices?q=x");
  });
});

describe("a path parameter pathOptions does not provide", () => {
  it("is filled from the caller's variables", async () => {
    const request = new Request("http://app.localhost/", { headers: { cookie: "orgId=42" } });
    const client = createCaller(tenantApi(), { context: { req: request } });

    await client.invoices.byId({ id: "7" });

    expect(upstream.received.map((r) => r.url)).toEqual(["/orgs/42/invoices/7"]);
  });

  it("is refused when the caller leaves it out", async () => {
    const request = new Request("http://app.localhost/", { headers: { cookie: "orgId=42" } });
    const client = createCaller(tenantApi(), { context: { req: request } });

    const error = await client.invoices.byId({} as { id: string }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(HTTPError);
    expect((error as HTTPError).status).toBe(400);
  });
});
