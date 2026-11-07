/**
 * A TanStack Start app calling an API that keeps a session, for React and
 * for Solid: each entry finds the request TanStack Start is serving with
 * its own `getRequest`, so every call carries that request's session —
 * a server caller's, and one made through `/client` — and the cookies the
 * API renews reach the response TanStack Start prepares. The API is a
 * real server, and each request is served inside TanStack Start's own
 * request scope.
 */
import { createCaller as clientCaller } from "@noverax/courier/client";
import { registerRequestContext } from "@noverax/courier/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as react from "../src/react";
import * as solid from "../src/solid";
import { type Accounts, type Seen, serveWithStart, startAccounts } from "./helpers/start-app";

let accounts: Accounts;

beforeAll(async () => {
  accounts = await startAccounts();
});

afterAll(async () => {
  await accounts.close();
});

const visit = (cookie: string, headers: Record<string, string> = {}, extra: object = {}): Request =>
  Object.assign(
    new Request("http://localhost:3000/account", { headers: { cookie, ...headers } }),
    extra,
  );

describe.each([
  ["React", react],
  ["Solid", solid],
])("TanStack Start for %s", (_framework, entry) => {
  it("serves a server caller's calls with the session of the request being served", async () => {
    const server = entry.createServerCaller(accounts.api);

    const { value } = await serveWithStart(visit("sid=ada; _ga=1"), () => server.me());

    expect(value.cookie).toBe("sid=ada");
  });

  it("serves a call made through /client with it too, once the provider is registered", async () => {
    registerRequestContext(entry.tanstackStartRequestContext);
    const page = clientCaller(accounts.api);

    const { value } = await serveWithStart(visit("sid=grace"), () => page.me());

    expect(value.cookie).toBe("sid=grace");
  });

  it("hands the browser the cookie the API renewed, on the response TanStack Start prepares", async () => {
    const server = entry.createServerCaller(accounts.api);

    const { setCookies } = await serveWithStart(visit("sid=ada"), () => server.renew());

    expect(setCookies).toEqual(["sid=renewed; Path=/; HttpOnly"]);
  });

  it("sends the renewed session with the calls the request makes after it", async () => {
    const server = entry.createServerCaller(accounts.api);

    const { value } = await serveWithStart(visit("sid=expiring"), async () => {
      await server.renew();
      return server.me();
    });

    expect(value.cookie).toBe("sid=renewed");
  });

  it("serves each of many concurrent requests with its own session", async () => {
    const server = entry.createServerCaller(accounts.api);
    const users = Array.from({ length: 20 }, (_, at) => `user${at}`);

    const seen = await Promise.all(
      users.map(async (sid) => {
        const { value } = await serveWithStart(visit(`sid=${sid}`), async () => {
          const first = await server.me();
          return { first, second: await server.me() };
        });
        return { sid, ...value };
      }),
    );

    for (const { sid, first, second } of seen) {
      expect(first.cookie).toBe(`sid=${sid}`);
      expect(second.cookie).toBe(`sid=${sid}`);
    }
  });

  it("names the user by the connection, after the chain a local proxy recorded", async () => {
    const server = entry.createServerCaller(accounts.api);
    const behindProxy = visit(
      "sid=ada",
      { "x-forwarded-for": "203.0.113.7" },
      { runtime: { node: { req: { socket: { remoteAddress: "10.0.0.2" } } } } },
    );

    const { value } = await serveWithStart(behindProxy, () => server.me());

    expect(value.address).toBe("203.0.113.7, 10.0.0.2");
  });

  it("sends no session where TanStack Start serves no request, and fails nothing", async () => {
    const server = entry.createServerCaller(accounts.api);

    const seen: Seen = await server.me();

    expect(seen.cookie).toBeNull();
  });
});
