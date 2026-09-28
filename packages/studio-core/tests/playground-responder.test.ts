/**
 * What the Playground receives from a runtime it asks to run an endpoint.
 *
 * A real Socket.IO server stands in for Studio: it sends `playground:execute`
 * and `playground:write` over the runtime's own socket, and reads back every
 * chunk the runtime answers with. The runtime serves real sources, and its
 * HTTP endpoints reach a real upstream.
 */
import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { registerSources } from "@noverax/courier";
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { Server, type Socket } from "socket.io";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { connectRuntimeSocket } from "../src/runtime/connect-runtime-socket";

interface Frame {
  event: string;
  payload: { rid: string; chunk?: Record<string, unknown>; error?: { message: string } };
}

const cleanups: Array<() => void | Promise<void>> = [];
const frames: Frame[] = [];
let runtime: Socket | undefined;
let upstreamUrl = "";

async function startUpstream(): Promise<void> {
  const server: HttpServer = createServer((req, res) => {
    if (req.method === "POST" && req.url === "/users") {
      res.writeHead(201, { "content-type": "application/json", "x-upstream": "yes" });
      res.end(JSON.stringify({ id: 3, name: "zed" }));
      return;
    }
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ message: "nope" }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  cleanups.push(() => new Promise<void>((resolve) => server.close(() => resolve())));
  upstreamUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

function registerTestSources(): void {
  const { endpoint, channel } = courier();
  const later = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
  const live = defineGroup({
    prefix: "live",
    endpoints: {
      chat: channel
        .send<{ text: string }>()
        .response<unknown>()
        .implement(() => ({
          onJoin: (ctx) => ctx.send({ text: "welcome" }),
          onMessage: (ctx, message) => ctx.send({ echo: message }),
        })),
      slow: channel
        .send<{ text: string }>()
        .response<unknown>()
        .implement(() => ({
          onJoin: () => later(100),
          onMessage: (ctx, message) => ctx.send({ echo: message }),
        })),
    },
  });
  const users = defineGroup({
    prefix: "users",
    endpoints: {
      create: endpoint
        .post("")
        .variables(z.object({ name: z.string().min(2) }))
        .response<{ id: number; name: string }>(),
      missing: endpoint.get("missing").response<unknown>(),
    },
  });
  registerSources({ api: defineApi({ baseURL: upstreamUrl, groups: { live, users } }) });
}

beforeAll(async () => {
  await startUpstream();
  registerTestSources();
  const http: HttpServer = createServer();
  const io = new Server(http);
  const connected = new Promise<void>((resolve) => {
    io.of("/runtime").on("connection", (socket) => {
      runtime = socket;
      for (const event of ["playground:chunk", "playground:end", "playground:error"]) {
        socket.on(event, (payload: Frame["payload"]) => frames.push({ event, payload }));
      }
      resolve();
    });
  });
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
  cleanups.push(() => {
    io.close();
  });
  const studioUrl = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
  await connectRuntimeSocket({ runtimeId: "playground", kind: "server", studioUrl }, [], {
    setDisposer: (dispose) => cleanups.push(dispose),
    setAnnouncer: () => {},
  });
  await connected;
});

afterAll(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

function framesOf(rid: string): Frame[] {
  return frames.filter((frame) => frame.payload.rid === rid);
}

async function until(check: () => boolean, what: string): Promise<void> {
  const deadline = Date.now() + 3_000;
  while (!check()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function execute(rid: string, group: string, method: string, transport: string, variables = {}): void {
  runtime?.emit("playground:execute", { rid, source: "api", group, method, transport, variables });
}

describe("a WebSocket channel opened from the Playground", () => {
  it("delivers what the channel sends on join, then the answer to a message", async () => {
    execute("ws-chat", "live", "chat", "ws");
    await until(() => framesOf("ws-chat").length >= 1, "the welcome");
    runtime?.emit("playground:write", { rid: "ws-chat", data: { text: "hi" } });
    await until(() => framesOf("ws-chat").length >= 2, "the echo");
    runtime?.emit("playground:cancel", { rid: "ws-chat" });

    expect(framesOf("ws-chat").map((frame) => frame.payload.chunk?.data)).toEqual([
      { text: "welcome" },
      { echo: { text: "hi" } },
    ]);
  });

  it("delivers a message written while the channel was still opening", async () => {
    execute("ws-slow", "live", "slow", "ws");
    runtime?.emit("playground:write", { rid: "ws-slow", data: { text: "early" } });
    await until(() => framesOf("ws-slow").length >= 1, "the echo");
    runtime?.emit("playground:cancel", { rid: "ws-slow" });

    expect(framesOf("ws-slow")[0]?.payload.chunk?.data).toEqual({ echo: { text: "early" } });
  });
});

describe("an HTTP endpoint run from the Playground", () => {
  it("reports the status the upstream answered with, and its headers", async () => {
    execute("http-created", "users", "create", "http", { name: "zed" });
    await until(() => framesOf("http-created").length >= 1, "the result");

    const chunk = framesOf("http-created")[0]?.payload.chunk;
    expect(chunk?.status).toBe(201);
    expect(chunk?.data).toEqual({ id: 3, name: "zed" });
    expect(chunk?.headers).toMatchObject({ "x-upstream": "yes" });
  });

  it("reports variables the schema refuses as the proxy would, not as a server failure", async () => {
    execute("http-refused", "users", "create", "http", { name: "z" });
    await until(() => framesOf("http-refused").length >= 1, "the result");

    const chunk = framesOf("http-refused")[0]?.payload.chunk;
    expect(chunk?.status).toBe(422);
    expect(chunk?.error).toMatch(/Validation failed \(variables\)/);
    expect((chunk?.data as { issues: unknown[] }).issues).toHaveLength(1);
  });

  it("reports an error answer with the body the upstream sent", async () => {
    execute("http-missing", "users", "missing", "http");
    await until(() => framesOf("http-missing").length >= 1, "the result");

    const chunk = framesOf("http-missing")[0]?.payload.chunk;
    expect(chunk?.status).toBe(404);
    expect(chunk?.data).toEqual({ message: "nope" });
    expect(chunk?.error).toBe("HTTP 404");
  });
});

describe("an HTTP call run from the Playground in proxy mode", () => {
  it("goes through the app's proxy route and answers as the browser would see it", async () => {
    const { createHandler, setAppOrigin } = await import("@noverax/courier");
    const { sendWebResponse, toWebRequest } = await import("@noverax/courier/node");
    const handler = createHandler();
    const proxied: string[] = [];
    const proxy: HttpServer = createServer(async (req, res) => {
      proxied.push(`${req.method} ${req.url}`);
      await sendWebResponse(await handler.handle(toWebRequest(req, res)), res);
    });
    await new Promise<void>((resolve) => proxy.listen(0, "127.0.0.1", resolve));
    cleanups.push(() => new Promise<void>((resolve) => proxy.close(() => resolve())));
    setAppOrigin(`http://127.0.0.1:${(proxy.address() as AddressInfo).port}`);
    cleanups.push(() => setAppOrigin(undefined));

    runtime?.emit("playground:execute", {
      rid: "proxy-create",
      source: "api",
      group: "users",
      method: "create",
      transport: "http",
      mode: "proxy",
      variables: { name: "zed" },
    });
    await until(() => framesOf("proxy-create").some((f) => f.event === "playground:end"), "the answer");

    expect(proxied).toEqual(["POST /api/request?_s=api&_g=users&_m=create"]);
    expect(framesOf("proxy-create")[0]?.payload.chunk).toMatchObject({
      kind: "http-result",
      status: 201,
      data: { id: 3, name: "zed" },
    });
  });

  it("says how to name the app's origin when none is known", async () => {
    const { setAppOrigin } = await import("@noverax/courier");
    setAppOrigin(undefined);

    runtime?.emit("playground:execute", {
      rid: "proxy-no-origin",
      source: "api",
      group: "users",
      method: "create",
      transport: "http",
      mode: "proxy",
      variables: { name: "zed" },
    });
    await until(() => framesOf("proxy-no-origin").length > 0, "the refusal");

    expect(String(framesOf("proxy-no-origin")[0]?.payload.chunk?.error)).toContain("appOrigin");
  });
});
