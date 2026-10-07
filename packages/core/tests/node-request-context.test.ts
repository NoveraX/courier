/**
 * A Node server that serves many users at once: each request's calls carry
 * that request's session and nobody else's, through every await between.
 *
 * The application and the API are real servers; the API records what each
 * call carried, and answers with a renewed session cookie the browser must
 * receive on the response of the request that caused it.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createCaller } from "../src/caller";
import { courier, defineApi } from "../src/define";
import { requestContext } from "../src/node";
import { sendJson, startUpstream, type Upstream } from "./helpers/middleware-upstream";

let api: Upstream;
let app: Server;
let appUrl: string;

beforeAll(async () => {
  api = await startUpstream((req, res) => {
    const sid = /sid=([^;]+)/.exec(req.headers.cookie ?? "")?.[1] ?? "none";
    if (req.url === "/renew") res.setHeader("set-cookie", `sid=${sid}-renewed; Path=/; HttpOnly`);
    setTimeout(() => sendJson(res, 200, { sid }), Math.random() * 20);
  });
  const { endpoint } = courier();
  const client = createCaller(
    defineApi({
      name: "accounts",
      baseURL: api.url,
      session: { cookies: ["sid"] },
      forward: { requestId: true },
      endpoints: {
        me: endpoint.get("me").response<{ sid: string }>(),
        renew: endpoint.get("renew").response<{ sid: string }>(),
      },
    }),
  );
  const middleware = requestContext();
  app = createServer((req, res) => {
    middleware(req, res, async () => {
      const first = await client.me();
      await new Promise((resolve) => setTimeout(resolve, Math.random() * 20));
      const second = await (req.url === "/renew" ? client.renew() : client.me());
      sendJson(res, 200, { first: first.sid, second: second.sid });
    });
  });
  await new Promise<void>((resolve) => app.listen(0, "127.0.0.1", resolve));
  appUrl = `http://127.0.0.1:${(app.address() as AddressInfo).port}`;
});

afterAll(async () => {
  app.closeAllConnections();
  await new Promise<void>((resolve) => app.close(() => resolve()));
  await api.close();
});

describe("a Node server serving many users at once", () => {
  it("gives each request's calls that request's session alone", async () => {
    const users = Array.from({ length: 40 }, (_, at) => `user${at}`);

    const answers = await Promise.all(
      users.map(async (sid) => {
        const response = await fetch(`${appUrl}/page`, {
          headers: { cookie: `sid=${sid}; theme=dark` },
        });
        return { sid, body: (await response.json()) as { first: string; second: string } };
      }),
    );

    for (const { sid, body } of answers) expect(body).toEqual({ first: sid, second: sid });
    expect(api.seen.every((seen) => !seen.headers.cookie?.includes("theme"))).toBe(true);
  });

  it("shares one request id among a request's calls, and no other request's", async () => {
    api.seen.length = 0;

    await Promise.all(
      ["a", "b"].map((sid) => fetch(`${appUrl}/page`, { headers: { cookie: `sid=${sid}` } })),
    );

    const idsBySession = new Map<string, Set<string>>();
    for (const seen of api.seen) {
      const sid = /sid=([^;]+)/.exec(seen.headers.cookie ?? "")?.[1] ?? "";
      const ids = idsBySession.get(sid) ?? new Set<string>();
      ids.add(String(seen.headers["x-request-id"]));
      idsBySession.set(sid, ids);
    }
    expect([...idsBySession.values()].map((ids) => ids.size)).toEqual([1, 1]);
    expect(idsBySession.get("a")).not.toEqual(idsBySession.get("b"));
  });

  it("hands the browser the session cookie the API renewed, on its own response", async () => {
    const response = await fetch(`${appUrl}/renew`, { headers: { cookie: "sid=ada" } });

    expect(response.headers.getSetCookie()).toEqual(["sid=ada-renewed; Path=/; Secure; HttpOnly"]);
  });
});
