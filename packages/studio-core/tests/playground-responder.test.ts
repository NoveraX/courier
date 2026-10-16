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
import { afterAll, beforeAll, describe, expect, it, onTestFinished } from "vitest";
import { z } from "zod";

import { playgroundRequestId } from "../src/lib/playground-request-id";
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
    if (req.method === "POST" && req.url === "/files") {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        const body = Buffer.concat(chunks).toString("latin1");
        res.writeHead(201, { "content-type": "application/json" });
        res.end(
          JSON.stringify({ bytes: body.length, named: body.includes('filename="photo.bin"') }),
        );
      });
      return;
    }
    /* Streams until the client leaves: a stream that only closes would be
       reconnected to, as SSE is. */
    if (req.method === "GET" && req.url === "/feeds/ticks") {
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.write(`data: ${JSON.stringify({ n: 1 })}\n\ndata: ${JSON.stringify({ n: 2 })}\n\n`);
      return;
    }
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
  const { endpoint, channel, stream } = courier();
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
      ticker: channel.response<{ tick: number }>().implement(async function* () {
        yield { tick: 1 };
        yield { tick: 2 };
      }),
      feed: stream.response<{ n: number }>().implement(async function* () {
        yield { data: { n: 1 } };
        yield { data: { n: 2 } };
      }),
      forever: stream.response<{ n: number }>().implement(async function* (ctx) {
        for (let n = 1; !ctx.signal.aborted; n++) {
          yield { data: { n } };
          await later(20);
        }
      }),
    },
  });
  const feeds = defineGroup({
    prefix: "feeds",
    endpoints: { ticks: stream.response<{ n: number }>().get("ticks") },
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
  const files = defineGroup({
    prefix: "files",
    endpoints: { upload: endpoint.post("").variables<FormData>().response<unknown>() },
  });
  registerSources({
    api: defineApi({ expose: true, baseURL: upstreamUrl, groups: { live, users, files, feeds } }),
  });
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

/* What a channel delivered, without the frame that says it connected. */
function messagesOf(rid: string): unknown[] {
  return framesOf(rid)
    .filter((frame) => frame.payload.chunk?.kind === "ws-message")
    .map((frame) => frame.payload.chunk?.data);
}

async function until(check: () => boolean, what: string): Promise<void> {
  const deadline = Date.now() + 3_000;
  while (!check()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/* The app's proxy route, in this process, as an app serves it. */
async function startProxy(): Promise<{ url: string; proxied: string[] }> {
  const { createHandler } = await import("@noverax/courier");
  const { sendWebResponse, toWebRequest } = await import("@noverax/courier/node");
  const handler = createHandler();
  const proxied: string[] = [];
  const proxy: HttpServer = createServer(async (req, res) => {
    proxied.push(`${req.method} ${req.url}`);
    await sendWebResponse(await handler.handle(toWebRequest(req, res)), res);
  });
  await new Promise<void>((resolve) => proxy.listen(0, "127.0.0.1", resolve));
  cleanups.push(() => new Promise<void>((resolve) => proxy.close(() => resolve())));
  return { url: `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`, proxied };
}

describe("a call from the Playground whose header the platform refuses", () => {
  /* A header value read from a file or the environment with its line break: the error quotes it. */
  async function registerLeaky(): Promise<void> {
    const { getSources } = await import("@noverax/courier");
    const api = Reflect.get(getSources() ?? {}, "api");
    const { endpoint, stream } = courier();
    const leaky = defineApi({
      expose: true,
      baseURL: upstreamUrl,
      headers: { authorization: "Bearer B34rer\nx" },
      groups: {
        account: defineGroup({
          prefix: "account",
          endpoints: {
            me: endpoint.get("me").response<unknown>(),
            ticks: stream.response<unknown>().get("ticks"),
          },
        }),
      },
    });
    registerSources({ api, leaky });
    onTestFinished(() => registerSources({ api }));
  }

  it("answers an HTTP call with the error, its token cut", async () => {
    await registerLeaky();

    runtime?.emit("playground:execute", {
      rid: "leaky-http",
      source: "leaky",
      group: "account",
      method: "me",
      transport: "http",
      variables: {},
    });
    await until(() => framesOf("leaky-http").length > 0, "the failure");

    const sent = JSON.stringify(framesOf("leaky-http"));
    expect(sent).toContain("[redacted]");
    expect(sent).not.toContain("B34rer");
  });

  it("ends a stream with the error, its token cut", async () => {
    await registerLeaky();

    runtime?.emit("playground:execute", {
      rid: "leaky-sse",
      source: "leaky",
      group: "account",
      method: "ticks",
      transport: "sse",
      variables: {},
    });
    await until(
      () => framesOf("leaky-sse").some((frame) => frame.event === "playground:error"),
      "the failure",
    );

    expect(JSON.stringify(framesOf("leaky-sse"))).not.toContain("B34rer");
  });
});

/* Studio's request hooks, as an attached runtime has them, for one test. */
async function watchRequests(): Promise<string[]> {
  const { studioHooks } = await import("@noverax/courier/internal");
  const started: string[] = [];
  studioHooks.onRequestStart = (event) => {
    started.push(event.id);
  };
  onTestFinished(() => {
    delete studioHooks.onRequestStart;
  });
  return started;
}

function execute(
  rid: string,
  group: string,
  method: string,
  transport: string,
  variables = {},
): void {
  runtime?.emit("playground:execute", { rid, source: "api", group, method, transport, variables });
}

describe("a WebSocket channel opened from the Playground", () => {
  it("delivers what the channel sends on join, then the answer to a message", async () => {
    execute("ws-chat", "live", "chat", "ws");
    await until(() => messagesOf("ws-chat").length >= 1, "the welcome");
    runtime?.emit("playground:write", { rid: "ws-chat", data: { text: "hi" } });
    await until(() => messagesOf("ws-chat").length >= 2, "the echo");
    runtime?.emit("playground:cancel", { rid: "ws-chat" });

    expect(messagesOf("ws-chat")).toEqual([{ text: "welcome" }, { echo: { text: "hi" } }]);
  });

  it("delivers what the channel sends on join while Studio watches the channel too", async () => {
    const { studioHooks } = await import("@noverax/courier/internal");
    const recorded: unknown[] = [];
    studioHooks.onStreamOpen = () => {};
    studioHooks.onStreamMessage = (event) => {
      recorded.push(event.dataPreview);
    };
    onTestFinished(() => {
      delete studioHooks.onStreamOpen;
      delete studioHooks.onStreamMessage;
    });

    execute("ws-watched", "live", "chat", "ws");
    await until(() => messagesOf("ws-watched").length >= 1, "the welcome");
    runtime?.emit("playground:cancel", { rid: "ws-watched" });

    expect(messagesOf("ws-watched")).toEqual([{ text: "welcome" }]);
    expect(recorded).toEqual(['{"text":"welcome"}']);
  });

  it("delivers a message written while the channel was still opening", async () => {
    execute("ws-slow", "live", "slow", "ws");
    runtime?.emit("playground:write", { rid: "ws-slow", data: { text: "early" } });
    await until(() => messagesOf("ws-slow").length >= 1, "the echo");
    runtime?.emit("playground:cancel", { rid: "ws-slow" });

    expect(messagesOf("ws-slow")).toEqual([{ echo: { text: "early" } }]);
  });

  it("says it connected, though it sends nothing on join", async () => {
    execute("ws-quiet", "live", "slow", "ws");
    await until(() => framesOf("ws-quiet").length >= 1, "the connection");
    runtime?.emit("playground:cancel", { rid: "ws-quiet" });

    expect(framesOf("ws-quiet")[0]?.payload.chunk).toEqual({ kind: "ws-open" });
    expect(messagesOf("ws-quiet")).toEqual([]);
  });
});

describe("a WebSocket push opened from the Playground", () => {
  it("delivers what it pushes, then ends", async () => {
    execute("ws-push", "live", "ticker", "ws");
    await until(
      () => framesOf("ws-push").some((frame) => frame.event !== "playground:chunk"),
      "the end",
    );

    expect(framesOf("ws-push").map((frame) => [frame.event, frame.payload.chunk?.data])).toEqual([
      ["playground:chunk", { tick: 1 }],
      ["playground:chunk", { tick: 2 }],
      ["playground:end", undefined],
    ]);
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
    expect((chunk?.data as { issues: unknown[] } | undefined)?.issues).toHaveLength(1);
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
    const { setAppOrigin } = await import("@noverax/courier");
    const { url, proxied } = await startProxy();
    setAppOrigin(url);
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
    await until(
      () => framesOf("proxy-create").some((f) => f.event === "playground:end"),
      "the answer",
    );

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

  it("needs no app origin for a source whose proxy path is absolute", async () => {
    const { getSources, setAppOrigin } = await import("@noverax/courier");
    setAppOrigin(undefined);
    const { url, proxied } = await startProxy();
    const registered = getSources() ?? {};
    const api = Reflect.get(registered, "api");
    const { endpoint } = courier();
    const pinned = defineApi({
      expose: true,
      baseURL: upstreamUrl,
      proxyPath: { http: `${url}/api/request` },
      groups: {
        users: defineGroup({
          prefix: "users",
          endpoints: { create: endpoint.post("").response<unknown>() },
        }),
      },
    });
    registerSources({ api, pinned });
    onTestFinished(() => registerSources({ api }));

    runtime?.emit("playground:execute", {
      rid: "proxy-absolute",
      source: "pinned",
      group: "users",
      method: "create",
      transport: "http",
      mode: "proxy",
      variables: { name: "zed" },
    });
    await until(
      () => framesOf("proxy-absolute").some((f) => f.event === "playground:end"),
      "the answer",
    );

    expect(proxied).toEqual(["POST /api/request?_s=pinned&_g=users&_m=create"]);
    expect(framesOf("proxy-absolute")[0]?.payload.chunk).toMatchObject({ status: 201 });
  });
});

describe("the request a Playground run makes", () => {
  it("is shown under the run's own id when it runs here", async () => {
    const started = await watchRequests();

    execute("run-direct", "users", "create", "http", { name: "zed" });
    await until(() => framesOf("run-direct").length >= 1, "the result");

    expect(started).toEqual([playgroundRequestId("run-direct")]);
  });

  it("is shown under the run's own id when it goes through the app's proxy route", async () => {
    const { setAppOrigin } = await import("@noverax/courier");
    const started = await watchRequests();
    const { url } = await startProxy();
    setAppOrigin(url);
    onTestFinished(() => setAppOrigin(undefined));

    runtime?.emit("playground:execute", {
      rid: "run-proxy",
      source: "api",
      group: "users",
      method: "create",
      transport: "http",
      mode: "proxy",
      variables: { name: "zed" },
    });
    await until(() => framesOf("run-proxy").some((f) => f.event === "playground:end"), "the end");

    expect(new Set(started)).toEqual(new Set([playgroundRequestId("run-proxy")]));
  });
});

describe("a form sent from the Playground", () => {
  it("reaches the endpoint as multipart, with its upload's progress on the way", async () => {
    runtime?.emit("playground:execute", {
      rid: "form-upload",
      source: "api",
      group: "files",
      method: "upload",
      transport: "http",
      form: [
        { name: "note", text: "hi" },
        {
          name: "file",
          file: {
            name: "photo.bin",
            type: "application/octet-stream",
            data: new Uint8Array(300_000),
          },
        },
      ],
    });
    await until(
      () => framesOf("form-upload").some((f) => f.event === "playground:end"),
      "the answer",
    );

    const chunks = framesOf("form-upload").map((f) => f.payload.chunk);
    const progress = chunks.filter((c) => c?.kind === "upload-progress");
    expect(progress.length).toBeGreaterThan(0);
    expect(progress.at(-1)).toMatchObject({ percentage: 100 });
    expect(chunks.find((c) => c?.kind === "http-result")).toMatchObject({
      status: 201,
      data: { named: true },
    });
  });
});

/* Studio's stream hooks, as an attached runtime has them, for one test. */
async function watchStreams(): Promise<{ opened: Set<string>; closed: Set<string> }> {
  const { studioHooks } = await import("@noverax/courier/internal");
  const opened = new Set<string>();
  const closed = new Set<string>();
  studioHooks.onStreamOpen = (event) => {
    opened.add(event.requestId);
  };
  studioHooks.onStreamClose = (event) => {
    closed.add(event.requestId);
  };
  onTestFinished(() => {
    delete studioHooks.onStreamOpen;
    delete studioHooks.onStreamClose;
  });
  return { opened, closed };
}

function ended(rid: string): boolean {
  return framesOf(rid).some((frame) => frame.event === "playground:end");
}

describe("the stream a Playground run opens", () => {
  it("is shown under the run's own id when this process serves it", async () => {
    const { opened } = await watchStreams();

    execute("feed-here", "live", "feed", "sse");
    execute("ticker-here", "live", "ticker", "ws");
    execute("chat-here", "live", "chat", "ws");
    await until(() => ended("feed-here") && ended("ticker-here"), "the streams to end");
    await until(() => opened.has(playgroundRequestId("chat-here")), "the channel");
    runtime?.emit("playground:cancel", { rid: "chat-here" });

    expect(opened).toEqual(
      new Set(["feed-here", "ticker-here", "chat-here"].map((rid) => playgroundRequestId(rid))),
    );
  });

  it("is opened as a client, under the run's own id, when its upstream serves it", async () => {
    const { opened } = await watchStreams();

    const chunks = () => framesOf("feed-remote").filter((f) => f.event === "playground:chunk");

    execute("feed-remote", "feeds", "ticks", "sse");
    await until(() => chunks().length === 2, "both events");
    runtime?.emit("playground:cancel", { rid: "feed-remote" });

    expect(chunks().map((frame) => frame.payload.chunk?.event)).toMatchObject([
      { data: { n: 1 } },
      { data: { n: 2 } },
    ]);
    expect(opened).toEqual(new Set([playgroundRequestId("feed-remote")]));
  });

  it("is shown under the run's own id when it goes through the app's proxy route", async () => {
    const { setAppOrigin } = await import("@noverax/courier");
    const { opened } = await watchStreams();
    const { url, proxied } = await startProxy();
    setAppOrigin(url);
    onTestFinished(() => setAppOrigin(undefined));

    runtime?.emit("playground:execute", {
      rid: "feed-proxy",
      source: "api",
      group: "live",
      method: "feed",
      transport: "sse",
      mode: "proxy",
      variables: {},
    });
    await until(() => ended("feed-proxy"), "the stream to end");

    expect(proxied).toEqual(["GET /api/sse?_s=api&_m=feed&_g=live"]);
    expect(opened).toEqual(new Set([playgroundRequestId("feed-proxy")]));
  });

  it("stops at once where the app's proxy serves it, when the run is cancelled", async () => {
    const { setAppOrigin } = await import("@noverax/courier");
    const { opened, closed } = await watchStreams();
    const { url } = await startProxy();
    setAppOrigin(url);
    onTestFinished(() => setAppOrigin(undefined));
    const id = playgroundRequestId("forever-proxy");

    runtime?.emit("playground:execute", {
      rid: "forever-proxy",
      source: "api",
      group: "live",
      method: "forever",
      transport: "sse",
      mode: "proxy",
      variables: {},
    });
    await until(() => opened.has(id), "the stream to open");
    runtime?.emit("playground:cancel", { rid: "forever-proxy" });

    await until(() => closed.has(id), "the stream to close");
  });
});
