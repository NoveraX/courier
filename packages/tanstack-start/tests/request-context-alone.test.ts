/**
 * `requestContext()` sets the server part up itself: in a process where
 * nothing else of Courier's server was made or registered, a call made
 * through `/client` while the middleware serves a request carries the
 * session of that request. Its own file, so its process has nothing else
 * in it.
 */
import { createCaller } from "@noverax/courier/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { requestContext } from "../src/react";
import { type Accounts, serveWithStart, startAccounts } from "./helpers/start-app";

let accounts: Accounts;

beforeAll(async () => {
  accounts = await startAccounts();
});

afterAll(async () => {
  await accounts.close();
});

describe("requestContext, alone", () => {
  it("serves a call made through /client with the session of the request", async () => {
    const serve = requestContext();
    const page = createCaller(accounts.api);

    const { value } = await serveWithStart(
      new Request("http://localhost:3000/", { headers: { cookie: "sid=ada" } }),
      (request) => serve({ request, next: () => page.me() }),
    );

    expect(value.cookie).toBe("sid=ada");
  });
});
