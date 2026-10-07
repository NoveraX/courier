/**
 * The cookies the API sets reach the browser on a Node response beside the
 * ones the server sets itself, however the server writes its head: through
 * `appendHeader`, as Express does, by setting the header again over them,
 * or by handing `writeHead` headers of its own, as Fastify does — the last
 * two would otherwise drop them.
 */
import { createServer, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";

import { appendSetCookie } from "../src/node-set-cookie";

/* The headers the browser receives from a server that answers each request as `answer` does. */
async function headersFrom(answer: (res: ServerResponse) => void): Promise<Headers> {
  const server = createServer((_req, res) => answer(res));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const { port } = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${port}/`);
    await response.text();
    return response.headers;
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

const cookiesFrom = async (answer: (res: ServerResponse) => void): Promise<string[]> =>
  (await headersFrom(answer)).getSetCookie();

describe("appendSetCookie", () => {
  it("keeps the API's cookie beside one the server hands writeHead", async () => {
    const cookies = await cookiesFrom((res) => {
      appendSetCookie(res, "sid=renewed; Path=/; HttpOnly");
      res.writeHead(200, { "Set-Cookie": ["theme=dark; Path=/"], "content-type": "text/plain" });
      res.end("ok");
    });

    expect(cookies).toEqual(["sid=renewed; Path=/; HttpOnly", "theme=dark; Path=/"]);
  });

  it("keeps it when writeHead is given a status message too", async () => {
    const cookies = await cookiesFrom((res) => {
      appendSetCookie(res, "sid=renewed; Path=/");
      res.writeHead(200, "Fine", { "set-cookie": "theme=dark; Path=/" });
      res.end();
    });

    expect(cookies).toEqual(["sid=renewed; Path=/", "theme=dark; Path=/"]);
  });

  it("keeps it when writeHead is given Node's flat list, keeping the other headers", async () => {
    const headers = await headersFrom((res) => {
      appendSetCookie(res, "sid=renewed; Path=/");
      res.writeHead(200, ["set-cookie", "theme=dark; Path=/", "content-type", "text/csv"]);
      res.end();
    });

    expect(headers.getSetCookie()).toEqual(["sid=renewed; Path=/", "theme=dark; Path=/"]);
    expect(headers.get("content-type")).toBe("text/csv");
  });

  it("sends each cookie once where the server writes its head through setHeader", async () => {
    const cookies = await cookiesFrom((res) => {
      appendSetCookie(res, "sid=renewed; Path=/");
      appendSetCookie(res, "csrftoken=t1; Path=/");
      res.appendHeader("set-cookie", "theme=dark; Path=/");
      res.end("ok");
    });

    expect(cookies).toEqual(["sid=renewed; Path=/", "csrftoken=t1; Path=/", "theme=dark; Path=/"]);
  });

  it("puts it back where the server set the header again over it", async () => {
    const cookies = await cookiesFrom((res) => {
      appendSetCookie(res, "sid=renewed; Path=/");
      res.setHeader("Set-Cookie", "theme=dark; Path=/");
      res.end("ok");
    });

    expect(cookies).toEqual(["sid=renewed; Path=/", "theme=dark; Path=/"]);
  });

  it("puts it before a cookie of the application's own by the same name, which wins", async () => {
    const cookies = await cookiesFrom((res) => {
      appendSetCookie(res, "sid=from-api; Path=/");
      res.setHeader("set-cookie", ["sid=from-app; Path=/"]);
      res.writeHead(200);
      res.end();
    });

    expect(cookies).toEqual(["sid=from-api; Path=/", "sid=from-app; Path=/"]);
  });

  it("says why once the head has been sent, and the response is left as it was", async () => {
    let late: true | string | undefined;
    const cookies = await cookiesFrom((res) => {
      res.writeHead(200, { "content-type": "text/plain" });
      late = appendSetCookie(res, "sid=late; Path=/");
      res.end("ok");
    });

    expect(late).toBe("the response had already been sent");
    expect(cookies).toEqual([]);
  });
});
