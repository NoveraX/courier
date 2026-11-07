/**
 * `csrfTokenMiddleware(...apis)`, the server part of a request middleware on a
 * page that writes later: where the request does not carry an API's
 * double-submit token, it asks the API for one once, hands it to the
 * response TanStack Start prepares, and the calls the request makes after
 * it send it at once. A request that carries it asks nothing.
 */
import { afterEach, describe, expect, it } from "vitest";

import { createServerCaller, csrfTokenMiddleware } from "../src/react";
import { type CsrfApi, startCsrfApi } from "./helpers/csrf-api";
import { serveWithStart } from "./helpers/start-app";

let apis: CsrfApi[] = [];

afterEach(async () => {
  await Promise.all(apis.map(({ upstream }) => upstream.close()));
  apis = [];
});

async function started(name: string): Promise<CsrfApi> {
  const api = await startCsrfApi(name);
  apis.push(api);
  return api;
}

/* A page of the application's own, as a browser asks for it. */
const page = (cookie: string): Request =>
  new Request("http://localhost:3000/account", {
    headers: { cookie, "sec-fetch-site": "same-origin" },
  });

describe("csrfTokenMiddleware", () => {
  it("asks the API for the token the request lacks, and hands it to the page's response", async () => {
    const shop = await started("shop");
    const serve = csrfTokenMiddleware(shop.api);

    const { value, setCookies } = await serveWithStart(page("sid=ada"), (request) =>
      serve({ request, next: async () => "the page" }),
    );

    expect(value).toBe("the page");
    expect(shop.upstream.received.map(({ method, url }) => `${method} ${url}`)).toEqual([
      "GET /csrf",
    ]);
    expect(setCookies).toEqual(["shop_csrf=t-shop; Path=/"]);
  });

  it("sends the token with the writes the request makes after it", async () => {
    const shop = await started("shop");
    const serve = csrfTokenMiddleware(shop.api);
    const server = createServerCaller(shop.api);

    await serveWithStart(page("sid=ada"), (request) =>
      serve({ request, next: () => server.rename({ name: "Ada" }) }),
    );

    const write = shop.upstream.received.find(({ url }) => url === "/me/name");
    expect(write?.headers["x-csrftoken"]).toBe("t-shop");
    expect(shop.upstream.received.filter(({ url }) => url === "/csrf")).toHaveLength(1);
  });

  it("asks nothing where the request carries the token", async () => {
    const shop = await started("shop");
    const serve = csrfTokenMiddleware(shop.api);

    const { setCookies } = await serveWithStart(page("sid=ada; shop_csrf=t-held"), (request) =>
      serve({ request, next: async () => "the page" }),
    );

    expect(shop.upstream.received).toEqual([]);
    expect(setCookies).toEqual([]);
  });

  it("asks each API it is given for its own", async () => {
    const shop = await started("shop");
    const billing = await started("billing");
    const serve = csrfTokenMiddleware(shop.api, billing.api);

    const { setCookies } = await serveWithStart(page("sid=ada"), (request) =>
      serve({ request, next: async () => "the page" }),
    );

    expect(shop.upstream.received.map(({ url }) => url)).toEqual(["/csrf"]);
    expect(billing.upstream.received.map(({ url }) => url)).toEqual(["/csrf"]);
    expect(setCookies).toEqual(["shop_csrf=t-shop; Path=/", "billing_csrf=t-billing; Path=/"]);
  });
});
