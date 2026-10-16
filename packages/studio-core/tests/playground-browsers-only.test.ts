/**
 * A Playground run in proxy mode against an app whose proxy answers
 * browsers only.
 *
 * The run is made from the app's process, so it says nothing of where it
 * comes from and `browsersOnly` would refuse it as it refuses a script.
 * The runtime gives each run a one-time pass the proxy redeems in the same
 * process; the pass goes no further than the proxy's gate, and a proxy that
 * cannot redeem it — as one in another process cannot — refuses the run
 * with the way past it. A real Socket.IO server stands in for Studio, and
 * the proxy and its upstream are real servers.
 */
import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { createHandler, registerSources, setAppOrigin } from "@noverax/courier";
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import {
  STUDIO_PASS_HEADER,
  STUDIO_PASS_REDEEMER,
  type StudioHooks,
  studioHooks,
} from "@noverax/courier/internal";
import { sendWebResponse, toWebRequest } from "@noverax/courier/node";
import { Server, type Socket } from "socket.io";
import { afterAll, beforeAll, describe, expect, it, onTestFinished } from "vitest";

import { playgroundRequestId } from "../src/lib/playground-request-id";
import { BROWSERS_ONLY_ADVICE } from "../src/runtime/browsers-only-refusal";
import { connectRuntimeSocket } from "../src/runtime/connect-runtime-socket";
import { admittedOnStudioPass } from "../src/runtime/studio-passes";

interface Frame {
  event: string;
  payload: { rid: string; chunk?: Record<string, unknown>; error?: { message: string } };
}

const cleanups: Array<() => void | Promise<void>> = [];
const frames: Frame[] = [];
const upstreamHeaders: string[][] = [];
let runtime: Socket | undefined;

async function listen(server: HttpServer): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  cleanups.push(() => new Promise<void>((resolve) => server.close(() => resolve())));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

async function startUpstream(): Promise<string> {
  return listen(
    createServer((req, res) => {
      upstreamHeaders.push(Object.keys(req.headers));
      req.resume();
      req.on("end", () => {
        res.writeHead(201, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      });
    }),
  );
}

/* The app's proxy route, in this process, answering browsers only. */
async function startProxy(): Promise<{ url: string; seen: Array<string | undefined> }> {
  const handler = createHandler({ browsersOnly: true });
  const seen: Array<string | undefined> = [];
  const url = await listen(
    createServer(async (req, res) => {
      seen.push(req.headers[STUDIO_PASS_HEADER] as string | undefined);
      await sendWebResponse(await handler.handle(toWebRequest(req, res)), res);
    }),
  );
  setAppOrigin(url);
  onTestFinished(() => setAppOrigin(undefined));
  return { url, seen };
}

beforeAll(async () => {
  const upstream = await startUpstream();
  const { endpoint, stream } = courier();
  registerSources({
    api: defineApi({
      expose: true,
      baseURL: upstream,
      allowedHeaders: [STUDIO_PASS_HEADER],
      groups: {
        users: defineGroup({
          prefix: "users",
          endpoints: { create: endpoint.post("").response<unknown>() },
        }),
        files: defineGroup({
          prefix: "files",
          endpoints: { upload: endpoint.post("").variables<FormData>().response<unknown>() },
        }),
        live: defineGroup({
          prefix: "live",
          endpoints: {
            feed: stream.response<{ n: number }>().implement(async function* () {
              yield { data: { n: 1 } };
              yield { data: { n: 2 } };
            }),
          },
        }),
      },
    }),
  });
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
  const studioUrl = await listen(http);
  cleanups.push(() => {
    io.close();
  });
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

function resultOf(rid: string): Record<string, unknown> | undefined {
  return framesOf(rid).find((frame) => frame.payload.chunk?.kind === "http-result")?.payload.chunk;
}

function ended(rid: string): boolean {
  return framesOf(rid).some((f) => f.event === "playground:end" || f.event === "playground:error");
}

async function until(check: () => boolean, what: string): Promise<void> {
  const deadline = Date.now() + 3_000;
  while (!check()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function run(rid: string, extra: Record<string, unknown> = {}): void {
  runtime?.emit("playground:execute", {
    rid,
    source: "api",
    group: "users",
    method: "create",
    transport: "http",
    mode: "proxy",
    variables: {},
    ...extra,
  });
}

/* Studio's hook for one test, as an attached runtime has it. */
function hook<TName extends keyof StudioHooks>(name: TName, fn: NonNullable<StudioHooks[TName]>) {
  studioHooks[name] = fn;
  onTestFinished(() => {
    studioHooks[name] = undefined;
  });
}

/* A proxy in another process finds nothing on its global object to redeem a pass with. */
function asIfInAnotherProcess(): void {
  const redeemer: unknown = Reflect.get(globalThis, STUDIO_PASS_REDEEMER);
  Reflect.deleteProperty(globalThis, STUDIO_PASS_REDEEMER);
  onTestFinished(() => {
    Reflect.set(globalThis, STUDIO_PASS_REDEEMER, redeemer);
  });
}

describe("an HTTP run through a proxy that answers browsers only", () => {
  it("is let through on its pass, which the proxy takes off before anything sees it", async () => {
    const { seen } = await startProxy();
    const started: Array<{ id: string; admitted: boolean }> = [];
    const sentOn: Array<Record<string, string>> = [];
    hook("onRequestStart", (event) => {
      started.push({ id: event.id, admitted: admittedOnStudioPass(event.id) });
    });
    hook("onRequestEnd", (event) => {
      sentOn.push(event.requestHeaders);
    });
    upstreamHeaders.length = 0;

    run("bo-create");
    await until(() => ended("bo-create"), "the answer");

    expect(resultOf("bo-create")).toMatchObject({ status: 201, data: { ok: true } });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatch(/^[A-Za-z0-9_-]{43}$/);
    /* The runtime's proxy caller and the proxy each start the one row. */
    expect(new Set(started.map((start) => start.id))).toEqual(
      new Set([playgroundRequestId("bo-create")]),
    );
    expect(started.every((start) => start.admitted)).toBe(true);
    expect(sentOn).toHaveLength(1);
    expect(Object.keys(sentOn[0] ?? {})).not.toContain(STUDIO_PASS_HEADER);
    expect(upstreamHeaders).toHaveLength(1);
    expect(upstreamHeaders[0]).not.toContain(STUDIO_PASS_HEADER);
    expect(admittedOnStudioPass(playgroundRequestId("bo-create"))).toBe(false);
  });

  it("lets every one of several runs made together through on a pass of its own", async () => {
    const { seen } = await startProxy();
    const rids = ["bo-1", "bo-2", "bo-3", "bo-4", "bo-5"];

    for (const rid of rids) run(rid);
    await until(() => rids.every(ended), "every answer");

    expect(rids.map((rid) => resultOf(rid)?.status)).toEqual([201, 201, 201, 201, 201]);
    expect(new Set(seen).size).toBe(rids.length);
  });

  it("sends the runtime's pass alone, whatever pass header the Playground was given", async () => {
    const { seen } = await startProxy();

    run("bo-forged", { headers: { "X-Courier-Studio-Pass": "A".repeat(43) } });
    await until(() => ended("bo-forged"), "the answer");

    expect(resultOf("bo-forged")).toMatchObject({ status: 201 });
    expect(seen[0]).not.toBe("A".repeat(43));
    expect(seen[0]).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("is let through with a form, its upload's progress on the way", async () => {
    await startProxy();

    run("bo-upload", {
      group: "files",
      method: "upload",
      form: [
        { name: "note", text: "hi" },
        {
          name: "file",
          file: { name: "a.bin", type: "application/octet-stream", data: new Uint8Array(200_000) },
        },
      ],
    });
    await until(() => ended("bo-upload"), "the answer");

    const chunks = framesOf("bo-upload").map((frame) => frame.payload.chunk);
    expect(chunks.filter((chunk) => chunk?.kind === "upload-progress").length).toBeGreaterThan(0);
    expect(resultOf("bo-upload")).toMatchObject({ status: 201 });
  });

  it("is refused with the way past it by a proxy that cannot redeem its pass", async () => {
    await startProxy();
    asIfInAnotherProcess();
    const started: string[] = [];
    hook("onRequestStart", (event) => {
      started.push(event.id);
    });

    run("bo-elsewhere");
    await until(() => ended("bo-elsewhere"), "the refusal");

    expect(resultOf("bo-elsewhere")).toMatchObject({
      status: 403,
      error: BROWSERS_ONLY_ADVICE,
      data: { code: "BROWSERS_ONLY" },
    });
    expect(started).toEqual([]);
  });
});

describe("an SSE run through a proxy that answers browsers only", () => {
  it("is let through on its pass, and marked as let through", async () => {
    const { seen } = await startProxy();
    const opened: Array<{ id: string; admitted: boolean; headers: string[] }> = [];
    hook("onStreamOpen", (event) => {
      opened.push({
        id: event.requestId,
        admitted: admittedOnStudioPass(event.requestId),
        headers: Object.keys(event.requestHeaders ?? {}),
      });
    });

    run("bo-feed", { group: "live", method: "feed", transport: "sse" });
    await until(() => ended("bo-feed"), "the stream to end");

    const events = framesOf("bo-feed").filter((frame) => frame.payload.chunk?.kind === "sse-event");
    expect(events.map((frame) => frame.payload.chunk?.event)).toMatchObject([
      { data: { n: 1 } },
      { data: { n: 2 } },
    ]);
    expect(seen[0]).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(opened).toHaveLength(1);
    expect(opened[0]).toMatchObject({ id: playgroundRequestId("bo-feed"), admitted: true });
    expect(opened[0]?.headers).not.toContain(STUDIO_PASS_HEADER);
  });

  it("is refused with the way past it by a proxy that cannot redeem its pass", async () => {
    await startProxy();
    asIfInAnotherProcess();

    run("bo-feed-elsewhere", { group: "live", method: "feed", transport: "sse" });
    await until(() => ended("bo-feed-elsewhere"), "the refusal");

    const failure = framesOf("bo-feed-elsewhere").find((f) => f.event === "playground:error");
    expect(failure?.payload.error?.message).toBe(BROWSERS_ONLY_ADVICE);
  });
});
