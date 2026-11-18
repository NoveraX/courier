/**
 * The WebSocket handler's HTTP transport on a Node server shared with the
 * application: its requests are taken ahead of every handler the
 * application gives the server, added before the attach or after it, so
 * none of them answers one a second time; every other request is the
 * application's, and is again once the handler is detached. They are read
 * and answered on Node's own request and response: an answer that is
 * whole when it is written states its length, and no web `Request`,
 * `Response`, `Headers` or stream is made for a poll or a send.
 */
import {
  createServer,
  request as httpRequest,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocketServer } from "ws";
import { createWSHandler } from "../src/adapter/handle-ws";
import type { WSHandler } from "../src/adapter/ws-types";
import { attachWebSocketUpgrade, type UpgradeServer } from "../src/node";
import { HTTP_REFUSALS, HTTP_TRANSPORT_VERSION } from "../src/realtime/ws/http-protocol";
import { encodeMessage } from "../src/realtime/ws/ws-protocol";
import { _resetSourcesForTests, registerSources } from "../src/server/sources";
import { authFrame } from "./helpers/fake-socket";
import { eventsOf } from "./helpers/http-client";

let server: Server | undefined;
const handlers: WSHandler[] = [];

afterEach(async () => {
  await Promise.all(handlers.splice(0).map((handler) => handler.destroy({ timeoutMs: 100 })));
  _resetSourcesForTests();
  server?.closeAllConnections();
  await new Promise<void>((resolve) => server?.close(() => resolve()) ?? resolve());
  server = undefined;
});

/** A server whose application answers every request it sees with a 404 of its own. */
async function serving(path: string | undefined) {
  registerSources({});
  const handler = createWSHandler({ onConnect: () => ({}) });
  handlers.push(handler);
  const app = vi.fn((_req: IncomingMessage, res: ServerResponse) => res.writeHead(404).end("app"));
  const late = vi.fn();
  server = createServer(app);
  const detach = attachWebSocketUpgrade(server, {
    path,
    createServer: (options) => new WebSocketServer(options) as unknown as UpgradeServer,
    onSocket: (socket, request) => handler.handleSocket(socket, request),
    httpTransport: handler,
  });
  server.on("request", late);
  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { origin, app, late, detach, handler };
}

const opening = [
  JSON.stringify({ op: "poll", v: HTTP_TRANSPORT_VERSION }),
  encodeMessage(authFrame()),
].join("\n");

function postTo(url: string, body: string, type = "text/plain;charset=UTF-8"): Promise<Response> {
  return fetch(url, { method: "POST", headers: { "content-type": type }, body });
}

describe("attachWebSocketUpgrade({ httpTransport })", () => {
  it("takes the transport's POST to the socket's path ahead of the application's handlers", async () => {
    const { origin, app, late } = await serving("/api/ws");

    const taken = await postTo(`${origin}/api/ws`, opening);
    const events = await eventsOf(taken).rest();
    const others = await Promise.all([fetch(`${origin}/api/ws`), postTo(`${origin}/api`, opening)]);

    expect(taken.status).toBe(200);
    expect(events.map((event) => event.event ?? JSON.parse(event.data).type)).toEqual([
      "open",
      "auth_ok",
    ]);
    expect(others.map((response) => response.status)).toEqual([404, 404]);
    expect(app).toHaveBeenCalledTimes(2);
    expect(late).toHaveBeenCalledTimes(2);
  });

  it("takes, on a server that hosts nothing but Courier, the POSTs whose body is text/plain", async () => {
    const { origin, app } = await serving(undefined);

    const taken = await postTo(`${origin}/anywhere`, opening);
    await eventsOf(taken).rest();
    const proxied = await postTo(`${origin}/api/request`, "{}", "application/json");

    expect([taken.status, proxied.status]).toEqual([200, 404]);
    expect(app).toHaveBeenCalledTimes(1);
  });

  it("leaves the transport's requests to the application once detached", async () => {
    const { origin, app, detach } = await serving("/api/ws");

    detach();
    const response = await postTo(`${origin}/api/ws`, opening);

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("app");
    expect(app).toHaveBeenCalledTimes(1);
  });
});

/** An answer as a Node client reads it, making no web object on this side either. */
interface RawAnswer {
  readonly status: number;
  readonly headers: IncomingHttpHeaders;
  readonly body: string;
}

/** A body as a client sends it: whole, its length stated, or in pieces, with none. */
type SentBody = string | Uint8Array<ArrayBuffer> | readonly string[];

const TEXT = { "content-type": "text/plain;charset=UTF-8" };

function postRaw(url: string, body: SentBody, headers = {}): Promise<RawAnswer> {
  return new Promise((resolve, reject) => {
    const sent = httpRequest(url, { method: "POST", headers: { ...TEXT, ...headers } }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("error", reject);
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve({ status: res.statusCode ?? 0, headers: res.headers, body: text });
      });
    });
    sent.on("error", reject);
    if (typeof body === "string" || body instanceof Uint8Array) {
      sent.end(body);
      return;
    }
    for (const piece of body) sent.write(piece);
    sent.end();
  });
}

/** The same request as a web one, its pieces a stream. */
function webPost(url: string, body: SentBody, headers = {}): Request {
  const init = { method: "POST", headers: { ...TEXT, ...headers } };
  if (typeof body === "string" || body instanceof Uint8Array)
    return new Request(url, { ...init, body });
  const pieces = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const piece of body) controller.enqueue(new TextEncoder().encode(piece));
      controller.close();
    },
  });
  return new Request(url, { ...init, body: pieces, duplex: "half" } as RequestInit);
}

/** A refusal's status and code. */
function refusedAs(status: number, body: string): [number, string | undefined] {
  return [status, (JSON.parse(body) as { code?: string }).code];
}

/** The frames' numbers and the named events of an answer of events, in order. */
function eventsIn(body: string): string[] {
  return body
    .split("\n\n")
    .map((block) => /^id: (\d+)$/m.exec(block)?.[1] ?? /^event: (\w+)$/m.exec(block)?.[1])
    .filter((named): named is string => named !== undefined);
}

const WEB_OBJECTS = ["Request", "Response", "Headers", "ReadableStream"] as const;

/** How many of each web object this process made while `during` ran. */
async function webObjectsMade(during: () => Promise<void>): Promise<Record<string, number>> {
  const made: Record<string, number> = {};
  for (const name of WEB_OBJECTS) {
    made[name] = 0;
    const counted = new Proxy(globalThis[name], {
      construct(target, args, newTarget) {
        made[name] = (made[name] ?? 0) + 1;
        return Reflect.construct(target, args, newTarget);
      },
    });
    vi.stubGlobal(name, counted);
  }
  try {
    await during();
  } finally {
    vi.unstubAllGlobals();
  }
  return made;
}

/** A connection opened with a poll; its token, once the poll has carried the client's auth. */
async function openedAt(url: string): Promise<string> {
  const answer = await postRaw(url, opening);
  const open = /^event: open\ndata: (.+)$/m.exec(answer.body)?.[1] ?? "{}";
  return (JSON.parse(open) as { token: string }).token;
}

describe("the transport on Node's own request and response", () => {
  it("answers a poll whole, stating its length, rather than in chunks", async () => {
    const { origin, handler } = await serving("/api/ws");
    const token = await openedAt(`${origin}/api/ws`);

    const polled = postRaw(`${origin}/api/ws`, JSON.stringify({ op: "poll", token, ack: 1 }));
    await expect.poll(() => handler.stats().http?.polling).toBe(1);
    handler.connections.send(handler.connections.list()[0]?.connectionId ?? "", "first");
    const answer = await polled;

    expect(answer.status).toBe(200);
    expect(answer.headers["content-type"]).toBe("text/event-stream");
    expect(answer.headers["transfer-encoding"]).toBeUndefined();
    expect(answer.headers["content-length"]).toBe(String(Buffer.byteLength(answer.body)));
    expect(eventsIn(answer.body)).toEqual(["2"]);
  });

  it("refuses whole too: a token no replica holds is answered 410, stating its length", async () => {
    const { origin } = await serving("/api/ws");

    const answer = await postRaw(`${origin}/api/ws`, JSON.stringify({ op: "poll", token: "x" }));

    expect(answer.status).toBe(410);
    expect(answer.headers["transfer-encoding"]).toBeUndefined();
    expect(answer.headers["content-length"]).toBe(String(Buffer.byteLength(answer.body)));
    expect(JSON.parse(answer.body)).toMatchObject({ success: false, code: HTTP_REFUSALS.gone });
  });

  it("refuses a body as the web path does: too large, declared or sent, compressed, not UTF-8", async () => {
    const { origin, handler } = await serving("/api/ws");
    const url = `${origin}/api/ws`;
    const large = "x".repeat(1_048_577);
    const bodies: { readonly body: SentBody; readonly headers?: Record<string, string> }[] = [
      { body: large },
      { body: [large.slice(0, 600_000), large.slice(600_000)] },
      { body: opening, headers: { "content-encoding": "gzip" } },
      { body: Uint8Array.of(0x7b, 0xff, 0xfe) },
    ];

    const overNode = await Promise.all(
      bodies.map(({ body, headers }) => postRaw(url, body, headers)),
    );
    const overWeb = await Promise.all(
      bodies.map(async ({ body, headers }) => {
        const answer = await handler.handleHTTP(webPost(url, body, headers));
        return refusedAs(answer.status, await answer.text());
      }),
    );

    expect(overNode.map((answer) => refusedAs(answer.status, answer.body))).toEqual(overWeb);
    expect(overWeb).toEqual([
      [413, "BODY_TOO_LARGE"],
      [413, "BODY_TOO_LARGE"],
      [415, "BODY_ENCODING_UNSUPPORTED"],
      [400, "BODY_MALFORMED"],
    ]);
    expect(handler.stats().http?.connections).toBe(0);
  });

  it("makes no web Request, Response, Headers or stream for a send or a poll", async () => {
    const { origin, handler } = await serving("/api/ws");
    const url = `${origin}/api/ws`;
    const token = await openedAt(url);
    const send = [
      JSON.stringify({ op: "send", token, seq: 2, ack: 1 }),
      encodeMessage({ type: "ping" }),
    ].join("\n");

    let polled: RawAnswer | undefined;
    const made = await webObjectsMade(async () => {
      const sent = await postRaw(url, send);
      expect(sent.status).toBe(204);
      polled = await postRaw(url, JSON.stringify({ op: "poll", token, ack: 1 }));
    });

    expect(eventsIn(polled?.body ?? "")).toEqual(["2"]);
    expect(made).toEqual({ Request: 0, Response: 0, Headers: 0, ReadableStream: 0 });
    expect(handler.stats().http?.connections).toBe(1);
  });
});
