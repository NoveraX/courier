/**
 * Pages Router functions served with their request at hand: an API route on
 * a real Node server calls an API that keeps a session, and the API — a real
 * server too — records what it received.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { createCaller } from "@noverax/courier";
import { courier, defineApi } from "@noverax/courier/define";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { withRequestContext } from "../src/pages";

/** What `getServerSideProps` is handed, as far as these tests read it. */
interface PageContext {
  req: IncomingMessage;
  res: ServerResponse;
  query: Record<string, string>;
}

const servers: Server[] = [];
const seen: Array<Record<string, string | string[] | undefined>> = [];
let appUrl: string;

async function listen(server: Server): Promise<string> {
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

beforeAll(async () => {
  const apiUrl = await listen(
    createServer((req, res) => {
      seen.push(req.headers);
      res.setHeader("set-cookie", "sid=renewed; Path=/v1; HttpOnly");
      res.writeHead(200, { "content-type": "application/json" });
      res.end('{"name":"Ada"}');
    }),
  );
  const { endpoint } = courier();
  const client = createCaller(
    defineApi({
      name: "accounts",
      baseURL: apiUrl,
      session: { cookies: ["sid"] },
      endpoints: { me: endpoint.get("me") },
    }),
  );
  const route = withRequestContext(async (_req: IncomingMessage, res: ServerResponse) => {
    const me = await client.me();
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(me));
  });
  const page = withRequestContext(async (context: PageContext) => ({
    props: { me: await client.me(), query: context.query },
  }));
  appUrl = await listen(
    createServer(async (req, res) => {
      if (req.url === "/api/me") return route(req, res);
      const result = await page({ req, res, query: { tab: "profile" } });
      res.end(JSON.stringify(result));
    }),
  );
});

afterAll(async () => {
  for (const server of servers) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

describe("withRequestContext", () => {
  it("serves an API route with the user's session, and hands back the renewed cookie", async () => {
    const response = await fetch(`${appUrl}/api/me`, { headers: { cookie: "sid=a1; theme=dark" } });

    expect(await response.json()).toEqual({ name: "Ada" });
    expect(seen.at(-1)?.cookie).toBe("sid=a1");
    expect(response.headers.getSetCookie()).toEqual(["sid=renewed; Path=/; HttpOnly"]);
  });

  it("serves getServerSideProps with its request, and leaves its context as it was", async () => {
    const response = await fetch(`${appUrl}/account`, { headers: { cookie: "sid=b2" } });

    expect(await response.json()).toEqual({
      props: { me: { name: "Ada" }, query: { tab: "profile" } },
    });
    expect(seen.at(-1)?.cookie).toBe("sid=b2");
  });
});
