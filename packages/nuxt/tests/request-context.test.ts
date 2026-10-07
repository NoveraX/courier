/**
 * A Nuxt application whose Nitro serves every request with its session at
 * hand: the plugin wraps the handler Nitro 2 serves requests with, as Nitro
 * wraps it for its own `asyncContext`, and the API — a real server —
 * records what each call carried.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { ConfigurationError, createCaller } from "@noverax/courier";
import { courier, defineApi } from "@noverax/courier/define";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { H3EventLike, H3NodeEvent } from "../src/h3-event";
import {
  type NitroAppLike,
  nuxtIncomingRequest,
  requestContextPlugin,
} from "../src/request-context";

const servers: Server[] = [];
const seen: Array<string | undefined> = [];
let appUrl: string;

async function listen(server: Server): Promise<string> {
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

beforeAll(async () => {
  const apiUrl = await listen(
    createServer((req, res) => {
      seen.push(req.headers.cookie);
      res.setHeader("set-cookie", "sid=renewed; Path=/api; HttpOnly");
      setTimeout(() => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ cookie: req.headers.cookie }));
      }, Math.random() * 15);
    }),
  );
  const { endpoint } = courier();
  const client = createCaller(
    defineApi({
      name: "accounts",
      baseURL: apiUrl,
      session: { cookies: ["sid"] },
      endpoints: { me: endpoint.get("me").response<{ cookie: string }>() },
    }),
  );
  /* What Nitro 2 builds: an h3 app whose handler its Node listener reads on every request. */
  const nitroApp: NitroAppLike = {
    h3App: {
      handler: async (event) => {
        const { res } = (event as H3NodeEvent).node;
        await new Promise((resolve) => setTimeout(resolve, Math.random() * 15));
        const me = await client.me();
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(me));
      },
    },
  };
  requestContextPlugin(nitroApp);
  appUrl = await listen(
    createServer((req: IncomingMessage, res: ServerResponse) => {
      void nitroApp.h3App.handler({ node: { req, res } });
    }),
  );
});

afterAll(async () => {
  for (const server of servers) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

describe("requestContextPlugin", () => {
  it("serves each of many concurrent requests with its own session", async () => {
    const users = Array.from({ length: 25 }, (_, at) => `user${at}`);

    const bodies = await Promise.all(
      users.map(async (sid) => {
        const response = await fetch(appUrl, { headers: { cookie: `sid=${sid}; theme=dark` } });
        return (await response.json()) as { cookie: string };
      }),
    );

    expect(bodies.map((body) => body.cookie)).toEqual(users.map((sid) => `sid=${sid}`));
  });

  it("hands the browser the session cookie the API renewed", async () => {
    const response = await fetch(appUrl, { headers: { cookie: "sid=ada" } });

    expect(response.headers.getSetCookie()).toEqual(["sid=renewed; Path=/; Secure; HttpOnly"]);
  });

  it("refuses a Nitro that serves requests some other way", () => {
    const failure = (() => {
      try {
        requestContextPlugin({ h3App: {} } as unknown as NitroAppLike);
      } catch (error) {
        return error;
      }
      return undefined;
    })();

    expect(failure).toBeInstanceOf(ConfigurationError);
    expect((failure as ConfigurationError).code).toBe("REQUEST_CONTEXT_UNSUPPORTED");
  });
});

describe("nuxtIncomingRequest on h3 2.x", () => {
  it("reads the Web request and appends cookies to the response it prepares", () => {
    const headers = new Headers();
    const event = {
      req: new Request("https://app.example.com/account", { headers: { cookie: "sid=a1" } }),
      res: { headers },
    } as unknown as H3EventLike;

    const incoming = nuxtIncomingRequest(event);
    const handed = incoming.setCookie?.({
      cookie: { name: "sid", value: "b2", path: "/" },
      header: "sid=b2; Path=/",
    });

    expect(incoming).toMatchObject({ method: "GET", origin: "https://app.example.com" });
    expect(handed).toBe(true);
    expect(headers.getSetCookie()).toEqual(["sid=b2; Path=/"]);
  });
});
