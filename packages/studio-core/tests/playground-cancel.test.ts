/**
 * An HTTP call from the Playground, cancelled before its answer came: the
 * request to the upstream is aborted — run in this process or through the
 * app's proxy route — and the runtime says nothing more of the run, since
 * Studio's router has ended it for the page already.
 *
 * A real Socket.IO server stands in for Studio, and a real upstream holds
 * each request open until the client leaves it.
 */
import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { createHandler, registerSources, setAppOrigin } from "@noverax/courier";
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { sendWebResponse, toWebRequest } from "@noverax/courier/node";
import { Server, type Socket } from "socket.io";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { connectRuntimeSocket } from "../src/runtime/connect-runtime-socket";

interface Frame {
  event: string;
  payload: { rid: string; chunk?: Record<string, unknown> };
}

/** A promise and what settles it, for waiting on an event rather than on time. */
function deferred<T = void>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

const cleanups: Array<() => void | Promise<void>> = [];
const frames: Frame[] = [];
const ended = new Map<string, ReturnType<typeof deferred<void>>>();
let runtime: Socket | undefined;
let upstreamUrl = "";
let proxyUrl = "";

/** A slow request the upstream holds open: settled once its client leaves it unanswered. */
interface SlowRequest {
  left: Promise<void>;
}

const nextSlow: Array<ReturnType<typeof deferred<SlowRequest>>> = [];

function arrivalOfNextSlow(): Promise<SlowRequest> {
  const arrival = deferred<SlowRequest>();
  nextSlow.push(arrival);
  return arrival.promise;
}

async function startUpstream(): Promise<void> {
  const server: HttpServer = createServer((req, res) => {
    if (req.url === "/reports/fast") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ fast: true }));
      return;
    }
    if (req.url !== "/reports/slow") {
      res.writeHead(404).end();
      return;
    }
    const left = deferred();
    res.on("close", () => {
      if (!res.writableFinished) left.resolve();
    });
    nextSlow.shift()?.resolve({ left: left.promise });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  cleanups.push(() => {
    server.closeAllConnections();
    return new Promise<void>((resolve) => server.close(() => resolve()));
  });
  upstreamUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

/* The app's proxy route, in this process, as an app serves it. */
async function startProxy(): Promise<void> {
  const handler = createHandler();
  const proxy: HttpServer = createServer(async (req, res) => {
    await sendWebResponse(await handler.handle(toWebRequest(req, res)), res);
  });
  await new Promise<void>((resolve) => proxy.listen(0, "127.0.0.1", resolve));
  cleanups.push(() => {
    proxy.closeAllConnections();
    return new Promise<void>((resolve) => proxy.close(() => resolve()));
  });
  proxyUrl = `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`;
}

beforeAll(async () => {
  await startUpstream();
  await startProxy();
  const { endpoint } = courier();
  registerSources({
    api: defineApi({
      expose: true,
      baseURL: upstreamUrl,
      groups: {
        reports: defineGroup({
          prefix: "reports",
          endpoints: {
            slow: endpoint.get("slow").response<{ ready: boolean }>(),
            fast: endpoint.get("fast").response<{ fast: boolean }>(),
          },
        }),
      },
    }),
  });
  setAppOrigin(proxyUrl);
  cleanups.push(() => setAppOrigin(undefined));
  const http: HttpServer = createServer();
  const io = new Server(http);
  const connected = new Promise<void>((resolve) => {
    io.of("/runtime").on("connection", (socket) => {
      runtime = socket;
      for (const event of ["playground:chunk", "playground:end", "playground:error"]) {
        socket.on(event, (payload: Frame["payload"]) => {
          frames.push({ event, payload });
          if (event !== "playground:chunk") ended.get(payload.rid)?.resolve();
        });
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

function execute(rid: string, method: string, mode: "direct" | "proxy"): Promise<void> {
  const end = deferred();
  ended.set(rid, end);
  runtime?.emit("playground:execute", {
    rid,
    source: "api",
    group: "reports",
    method,
    transport: "http",
    mode,
    variables: {},
  });
  return end.promise;
}

function framesOf(rid: string): Frame[] {
  return frames.filter((frame) => frame.payload.rid === rid);
}

describe.each(["direct", "proxy"] as const)(
  "an HTTP call cancelled from the Playground, %s",
  (mode) => {
    it("aborts the request to the upstream", async () => {
      const arrival = arrivalOfNextSlow();
      void execute(`abort-${mode}`, "slow", mode);
      const request = await arrival;

      runtime?.emit("playground:cancel", { rid: `abort-${mode}` });

      await expect(request.left).resolves.toBeUndefined();
    });

    it("says nothing more of the run once it is cancelled", async () => {
      const arrival = arrivalOfNextSlow();
      void execute(`quiet-${mode}`, "slow", mode);
      const request = await arrival;

      runtime?.emit("playground:cancel", { rid: `quiet-${mode}` });
      await request.left;
      /* The socket keeps its order: whatever the runtime said of the cancelled
       run, it said before the answer of a call sent after the cancel. */
      await execute(`after-${mode}`, "fast", mode);

      expect(framesOf(`quiet-${mode}`)).toEqual([]);
      expect(framesOf(`after-${mode}`)[0]?.payload.chunk).toMatchObject({ status: 200 });
    });
  },
);
