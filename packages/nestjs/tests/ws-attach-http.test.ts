/**
 * The HTTP transport of `courierWSAttach` on a NestJS application's server: a
 * client whose network lets no WebSocket through opens the same connection
 * with a `POST` to the socket's path, which is taken off the server ahead of
 * the application's own listener — Nest's, with its body parsers — and is the
 * application's again with `http: false`.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { registerSources } from "@noverax/courier";
import { defineApi } from "@noverax/courier/define";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { type CourierWSAttachOptions, courierWSAttach } from "../src/index";

/** A poll that opens a connection: its head, then the client's `auth` frame, of protocol version 2. */
const OPEN = `${JSON.stringify({ op: "poll", v: 1 })}\n${JSON.stringify({ type: "auth", v: 2, id: "a0" })}`;

let server: Server | undefined;
let stop: (() => Promise<void>) | undefined;

beforeEach(() => {
  registerSources({ api: defineApi({ baseURL: "https://upstream.example", endpoints: {} }) });
});

afterEach(async () => {
  await stop?.();
  stop = undefined;
  server?.closeAllConnections();
  await new Promise<void>((resolve) => server?.close(() => resolve()) ?? resolve());
  server = undefined;
});

/* The application's listener, as Nest's is: it reads each body whole, then answers it itself. */
function application(request: IncomingMessage, response: ServerResponse): void {
  request.resume();
  request.on("end", () => response.writeHead(418).end("the application's"));
}

async function serve(options: CourierWSAttachOptions): Promise<string> {
  server = createServer(application);
  stop = courierWSAttach(server, options);
  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/ws`;
}

function openOverHTTP(url: string): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "content-type": "text/plain;charset=UTF-8" },
    body: OPEN,
  });
}

describe("courierWSAttach's HTTP transport on a Nest server", () => {
  it("answers a POST on the socket's path, ahead of the application's listener", async () => {
    const response = await openOverHTTP(await serve({}));
    const body = await response.text();

    expect(response.headers.get("content-type")).toBe("text/event-stream");
    expect(body).toMatch(/^event: open\n/);
    expect(body).toContain('"type":"auth_ok"');
  });

  it("leaves the POSTs on the path to the application with http: false", async () => {
    const response = await openOverHTTP(await serve({ http: false }));

    expect(response.status).toBe(418);
    expect(await response.text()).toBe("the application's");
  });
});
