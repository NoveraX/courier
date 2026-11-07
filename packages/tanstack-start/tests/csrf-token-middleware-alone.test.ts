/**
 * `csrfTokenMiddleware` sets the server part up itself: in a process where
 * nothing else of Courier's server was made or registered, it asks the API
 * for the token with the request's session and hands it to the response.
 * Its own file, so its process has nothing else in it.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { csrfTokenMiddleware } from "../src/react";
import { type CsrfApi, startCsrfApi } from "./helpers/csrf-api";
import { serveWithStart } from "./helpers/start-app";

let shop: CsrfApi;

beforeAll(async () => {
  shop = await startCsrfApi("shop");
});

afterAll(async () => {
  await shop.upstream.close();
});

describe("csrfTokenMiddleware, alone", () => {
  it("asks for the token with the session of the request, and hands it over", async () => {
    const serve = csrfTokenMiddleware(shop.api);

    const { setCookies } = await serveWithStart(
      new Request("http://localhost:3000/account", { headers: { cookie: "sid=ada" } }),
      (request) => serve({ request, next: async () => "the page" }),
    );

    expect(shop.upstream.received[0]?.headers.cookie).toBe("sid=ada");
    expect(setCookies).toEqual(["shop_csrf=t-shop; Path=/"]);
  });
});
