/**
 * `requestContext()`, the server part of a request middleware: what it is
 * given back by the rest of the request it gives back, and once that rest
 * has answered — a page streaming, a server function's reply sent — a
 * cookie the API sets for the request is refused with the reason, and the
 * response does not take it. It is what `createMiddleware().server(…)`
 * takes, by TanStack Start's own types.
 */
import { createMiddleware } from "@tanstack/react-start";
import { appendResponseHeader, getRequest } from "@tanstack/react-start/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createServerCaller, requestContext } from "../src/react";
import { startIncomingRequest } from "../src/request-context";
import { type Accounts, serveWithStart, startAccounts } from "./helpers/start-app";

let accounts: Accounts;

beforeAll(async () => {
  accounts = await startAccounts();
});

afterAll(async () => {
  await accounts.close();
});

const late = { cookie: { name: "sid", value: "late" }, header: "sid=late; Path=/" };
const start = { getRequest, appendResponseHeader };

describe("requestContext()", () => {
  it("gives back what the rest of the request gave", async () => {
    const serve = requestContext();

    const { value } = await serveWithStart(new Request("http://localhost:3000/"), (request) =>
      serve({ request, next: async () => "the page" }),
    );

    expect(value).toBe("the page");
  });

  it("refuses a cookie set once the rest of the request has answered, and the response takes none", async () => {
    const serve = requestContext();

    const { value, setCookies } = await serveWithStart(
      new Request("http://localhost:3000/", { headers: { cookie: "sid=ada" } }),
      async (request) => {
        await serve({ request, next: async () => "the page" });
        return startIncomingRequest(request, start).setCookie?.(late);
      },
    );

    expect(value).toMatch(/^the response had already been handed back/);
    expect(setCookies).toEqual([]);
  });

  it("hands over the cookies the API set while the rest of the request was served", async () => {
    const serve = requestContext();
    const server = createServerCaller(accounts.api);

    const { setCookies } = await serveWithStart(
      new Request("http://localhost:3000/", { headers: { cookie: "sid=ada" } }),
      (request) => serve({ request, next: () => server.renew() }),
    );

    expect(setCookies).toEqual(["sid=renewed; Path=/; HttpOnly"]);
  });

  it("marks the request answered when the rest of it fails, too", async () => {
    const serve = requestContext();

    const { value } = await serveWithStart(
      new Request("http://localhost:3000/"),
      async (request) => {
        const failing = serve({
          request,
          next: async () => {
            throw new Error("the page failed");
          },
        });
        await expect(failing).rejects.toThrow("the page failed");
        return startIncomingRequest(request, start).setCookie?.(late);
      },
    );

    expect(value).toMatch(/^the response had already been handed back/);
  });

  it("is what createMiddleware().server takes", () => {
    const middleware = createMiddleware().server(requestContext());

    expect(typeof middleware.options.server).toBe("function");
  });
});
