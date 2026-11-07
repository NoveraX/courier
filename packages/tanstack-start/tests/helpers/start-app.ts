import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { courier, defineApi } from "@noverax/courier/define";
import { createServerEntry, getResponseHeaders } from "@tanstack/react-start/server";

/** What the API saw of a call: the cookies it was sent, and the user's address. */
export interface Seen {
  cookie: string | null;
  address: string | null;
}

/** A real API that keeps a session in `sid`, and renews it on `session/renew`. */
export interface Accounts {
  readonly baseURL: string;
  readonly api: ReturnType<typeof accountsApi>;
  close(): Promise<void>;
}

function accountsApi(baseURL: string) {
  const { endpoint } = courier();
  return defineApi({
    name: "accounts",
    baseURL,
    session: { cookies: ["sid"] },
    forward: { clientAddress: true },
    endpoints: {
      me: endpoint.get("me").response<Seen>(),
      renew: endpoint.get("session/renew").response<Seen>(),
    },
  });
}

/**
 * Start the API on a free port.
 *
 * @returns The API, its definition, and how to stop it
 */
export async function startAccounts(): Promise<Accounts> {
  const server: Server = createServer((req, res) => {
    if (req.url === "/session/renew") res.setHeader("set-cookie", "sid=renewed; Path=/; HttpOnly");
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        cookie: req.headers.cookie ?? null,
        address: req.headers["x-forwarded-for"] ?? null,
      }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseURL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    baseURL,
    api: accountsApi(baseURL),
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

/** What a request served this way answered: what its code gave, and the cookies set for it. */
export interface Served<TValue> {
  value: TValue;
  setCookies: string[];
}

/**
 * Serve a request inside TanStack Start's own request scope, as its server
 * entry serves each one, and answer with what `serve` gives and the
 * cookies its code set through TanStack Start's response helpers.
 *
 * @param request - The request
 * @param serve - The code that serves it
 * @returns What it gave, and the cookies set for the response
 */
export async function serveWithStart<TValue>(
  request: Request,
  serve: (request: Request) => Promise<TValue>,
): Promise<Served<TValue>> {
  const entry = createServerEntry({
    fetch: async (served) =>
      Response.json({
        value: await serve(served),
        setCookies: getResponseHeaders().getSetCookie(),
      }),
  });
  const response = await entry.fetch(request);
  return (await response.json()) as Served<TValue>;
}
