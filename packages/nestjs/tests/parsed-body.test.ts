/**
 * The proxy behind NestJS's own body parsing.
 *
 * `NestFactory.create(AppModule)` mounts Express's JSON and URL-encoded
 * parsers across the whole application before any middleware runs, and a
 * route cannot opt out. The proxy reads the body those parsers left, so a
 * JSON call is served rather than answered 500 REQUEST_BODY_ALREADY_READ —
 * and the parser stays on, since turning it off empties every `@Body()` in
 * the app.
 *
 * The parsers here are the ones Nest registers, with the options it passes.
 */
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createProxyCaller, registerSources } from "@noverax/courier";
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import bodyParser from "body-parser";
import express from "express";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { courierMiddleware } from "../src/index";
import { bodyNestParsed } from "../src/parsed-body";

const { endpoint } = courier();
const servers: Server[] = [];

type EchoClient = {
  echo: { create(variables: { name: string }): Promise<{ body: string; length: string }> };
};

async function listen(server: Server): Promise<string> {
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

/** An upstream that answers each call with the body and length it received. */
async function echoUpstream(): Promise<string> {
  return listen(
    createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        const body = Buffer.concat(chunks).toString();
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ body, length: req.headers["content-length"] ?? "" }));
      });
    }),
  );
}

/** Nest's `rawBody: true` keeps the bytes it parsed on the request. */
function keepRawBody(req: IncomingMessage, _res: unknown, buffer: Buffer): void {
  Object.assign(req, { rawBody: buffer });
}

/** An application wired the way `NestFactory.create` wires its Express adapter. */
async function nestLikeApp(options: { rawBody?: boolean } = {}): Promise<string> {
  const kept = options.rawBody ? { verify: keepRawBody } : {};
  const app = express();
  app.use(bodyParser.json(kept));
  app.use(bodyParser.urlencoded({ extended: true, ...kept }));
  app.use("/api/request", courierMiddleware());
  return listen(createServer(app));
}

function callerAt(origin: string): EchoClient {
  return createProxyCaller("api", {
    proxyPath: { http: `${origin}/api/request` },
  }) as unknown as EchoClient;
}

beforeEach(async () => {
  const baseURL = await echoUpstream();
  const echo = defineGroup({
    prefix: "echo",
    endpoints: { create: endpoint.post("").variables<{ name: string }>() },
  });
  registerSources({ api: defineApi({ baseURL, groups: { echo } }) });
});

afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

describe("a JSON call through NestJS's default body parser", () => {
  it("reaches the upstream with the variables it was sent", async () => {
    const origin = await nestLikeApp();

    const answer = await callerAt(origin).echo.create({ name: "ada" });

    expect(JSON.parse(answer.body)).toEqual({ name: "ada" });
  });

  it("forwards the exact bytes when Nest keeps the raw body", async () => {
    const origin = await nestLikeApp({ rawBody: true });

    const answer = await callerAt(origin).echo.create({ name: "grace" });

    expect(answer.body).toBe('{"name":"grace"}');
    expect(answer.length).toBe(String(answer.body.length));
  });
});

describe("a call the parser leaves alone", () => {
  it("still reads a multipart body from the stream", async () => {
    const origin = await nestLikeApp();
    const form = new FormData();
    form.set("name", "linus");

    const response = await fetch(`${origin}/api/request?_s=api&_g=echo&_m=create`, {
      method: "POST",
      body: form,
    });

    expect(response.status).toBe(200);
  });
});

describe("bodyNestParsed", () => {
  function parsed(contentType: string, body: unknown): IncomingMessage {
    return { headers: { "content-type": contentType }, body } as unknown as IncomingMessage;
  }

  it("serializes a body parsed from a +json media type", () => {
    expect(bodyNestParsed(parsed("application/merge-patch+json", { a: 1 }))).toBe('{"a":1}');
  });

  it("leaves a URL-encoded form, which it cannot rebuild faithfully", () => {
    expect(bodyNestParsed(parsed("application/x-www-form-urlencoded", { a: "1" }))).toBeUndefined();
  });

  it("has nothing to give when the parser left no body", () => {
    expect(bodyNestParsed(parsed("application/json", undefined))).toBeUndefined();
  });
});
