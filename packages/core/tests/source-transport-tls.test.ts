/**
 * A source reaches a server that asks for a client certificate, and a server
 * behind a proxy, with undici's `fetch`, its `WebSocket` and a `dispatcher`
 * of the same undici — its calls, its streams and its channels alike. With
 * Node's own proxy turned on in the environment and the authority named in
 * `NODE_EXTRA_CA_CERTS`, a source that names none of them reaches the server
 * through the proxy too.
 */
import { execFile } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:https";
import { createRequire } from "node:module";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TLSSocket } from "node:tls";
import { pathToFileURL } from "node:url";
import { Agent, ProxyAgent, WebSocket as UndiciWebSocket, fetch as undiciFetch } from "undici";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WebSocketServer } from "ws";

import { createWSHandler } from "../src/adapter/handle-ws";
import type { WSHandler } from "../src/adapter/ws-types";
import { createCaller } from "../src/caller";
import { defineApi } from "../src/define/api";
import { courier } from "../src/define/courier";
import { defineGroup } from "../src/define/group";
import type { BaseOptions } from "../src/http-client/types";
import { attachWebSocketUpgrade, type UpgradeServer } from "../src/node";
import { clearWSConnectionPool } from "../src/realtime/caller-ws";
import { _resetSourcesForTests, registerSources } from "../src/sources";
import { type ForwardProxy, startForwardProxy } from "./helpers/forward-proxy";
import { testCertificates } from "./helpers/test-certificates";

const { endpoint, stream, channel } = courier();
const certificates = testCertificates();
const TSX = pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href;

interface Served {
  server: Server;
  handler: WSHandler;
  url: string;
}

let mutual: Served;
let plain: Served;

/* The endpoints, served at `/catalog/items`, `/catalog/ticks` and as the channel `api.live.greeting`. */
async function serve(askForCertificate: boolean): Promise<Served> {
  const handler = createWSHandler();
  const server = createServer(
    {
      ...certificates.server,
      ca: certificates.ca,
      requestCert: askForCertificate,
      rejectUnauthorized: askForCertificate,
    },
    (req, res) => {
      if (req.url === "/catalog/ticks") {
        res.writeHead(200, { "content-type": "text/event-stream" });
        return void res.end("data: 1\n\ndata: 2\n\nevent: courier:complete\ndata: null\n\n");
      }
      const client = (req.socket as TLSSocket).getPeerCertificate().subject?.CN ?? null;
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ client }));
    },
  );
  attachWebSocketUpgrade(server, {
    path: undefined,
    createServer: (options) => new WebSocketServer(options) as unknown as UpgradeServer,
    onSocket: (socket, request) => handler.handleSocket(socket, request),
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { server, handler, url: `https://localhost:${(server.address() as AddressInfo).port}` };
}

async function stop(served: Served): Promise<void> {
  await served.handler.destroy();
  served.server.closeAllConnections();
  await new Promise<void>((resolve) => served.server.close(() => resolve()));
}

beforeAll(async () => {
  registerSources({
    api: defineApi({
      name: "api",
      baseURL: "http://127.0.0.1:1",
      groups: {
        live: defineGroup({
          prefix: "live",
          endpoints: {
            greeting: channel.response<string>().implement(async function* () {
              yield "hello";
            }),
          },
        }),
      },
    }),
  } as never);
  mutual = await serve(true);
  plain = await serve(false);
});

afterAll(async () => {
  clearWSConnectionPool();
  _resetSourcesForTests();
  await Promise.all([stop(mutual), stop(plain)]);
});

function remote(
  baseURL: string,
  transport: Pick<BaseOptions, "fetch" | "webSocket" | "dispatcher">,
) {
  return defineApi({
    name: "api",
    baseURL,
    ...transport,
    groups: {
      catalog: defineGroup({
        prefix: "catalog",
        endpoints: { items: endpoint.get("items"), ticks: stream.response<number>().get("ticks") },
      }),
      live: defineGroup({
        prefix: "live",
        endpoints: { greeting: channel.response<string>().connect("greeting") },
      }),
    },
  });
}

/* A call, the stream's events and the channel's first message, as a direct caller of the source receives them. */
async function everyTransport(api: ReturnType<typeof remote>) {
  const client = createCaller(api);
  const call = await client.catalog.items();
  const ticks: unknown[] = [];
  for await (const tick of client.catalog.ticks()) ticks.push(tick.data);
  let greeting: unknown;
  for await (const message of client.live.greeting()) {
    greeting = message.data;
    break;
  }
  return { call, ticks, greeting };
}

describe("a server that asks for a client certificate", () => {
  it("is reached with undici's fetch and WebSocket and a dispatcher holding the certificate", async () => {
    const { ca, client } = certificates;
    const dispatcher = new Agent({ connect: { ca, cert: client.cert, key: client.key } });
    const api = remote(mutual.url, { fetch: undiciFetch, webSocket: UndiciWebSocket, dispatcher });

    const received = await everyTransport(api);

    expect(received).toEqual({
      call: { client: "courier-client" },
      ticks: [1, 2],
      greeting: "hello",
    });
    await dispatcher.close();
  });

  it("refuses a source whose dispatcher holds no certificate", async () => {
    const dispatcher = new Agent({ connect: { ca: certificates.ca } });
    const api = remote(mutual.url, { fetch: undiciFetch, webSocket: UndiciWebSocket, dispatcher });

    await expect(createCaller(api).catalog.items()).rejects.toThrow();
    await dispatcher.close();
  });
});

describe("a server behind a proxy", () => {
  let proxy: ForwardProxy;

  beforeAll(async () => {
    proxy = await startForwardProxy();
  });

  afterAll(async () => {
    await proxy.close();
  });

  it("is reached through it with undici's fetch and WebSocket and a ProxyAgent", async () => {
    const dispatcher = new ProxyAgent({ uri: proxy.url, requestTls: { ca: certificates.ca } });
    const api = remote(plain.url, { fetch: undiciFetch, webSocket: UndiciWebSocket, dispatcher });

    const received = await everyTransport(api);

    expect(received).toEqual({
      call: { client: null },
      ticks: [1, 2],
      greeting: "hello",
    });
    expect(new Set(proxy.seen)).toEqual(new Set([`CONNECT ${new URL(plain.url).host}`]));
    await dispatcher.close();
  });

  it("is reached through Node's own proxy, turned on in the environment, by a source that names none", {
    timeout: 30_000,
  }, async () => {
    proxy.seen.length = 0;
    const directory = mkdtempSync(join(tmpdir(), "courier-env-proxy-"));
    const caFile = join(directory, "ca.pem");
    writeFileSync(caFile, certificates.ca);
    const script = join(directory, "call.mts");
    writeFileSync(script, childScript(plain.url));

    const output = await runNode(script, {
      NODE_USE_ENV_PROXY: "1",
      HTTPS_PROXY: proxy.url,
      NO_PROXY: "",
      NODE_EXTRA_CA_CERTS: caFile,
    });
    rmSync(directory, { recursive: true, force: true });

    expect(JSON.parse(output)).toEqual({
      call: { client: null },
      ticks: [1, 2],
      greeting: "hello",
    });
    expect(new Set(proxy.seen)).toEqual(new Set([`CONNECT ${new URL(plain.url).host}`]));
  });
});

function childScript(baseURL: string): string {
  const source = (path: string) =>
    JSON.stringify(pathToFileURL(join(__dirname, "../src", path)).href);
  return `import { createCaller } from ${source("caller.ts")};
import { defineApi } from ${source("define/api.ts")};
import { courier } from ${source("define/courier.ts")};
import { defineGroup } from ${source("define/group.ts")};

const { endpoint, stream, channel } = courier();
const api = defineApi({
  name: "api",
  baseURL: ${JSON.stringify(baseURL)},
  groups: {
    catalog: defineGroup({ prefix: "catalog", endpoints: { items: endpoint.get("items"), ticks: stream.response().get("ticks") } }),
    live: defineGroup({ prefix: "live", endpoints: { greeting: channel.response().connect("greeting") } }),
  },
});
const client = createCaller(api);
const call = await client.catalog.items();
const ticks = [];
for await (const tick of client.catalog.ticks()) ticks.push(tick.data);
let greeting;
for await (const message of client.live.greeting()) { greeting = message.data; break; }
process.stdout.write(JSON.stringify({ call, ticks, greeting }));
process.exit(0);
`;
}

function runNode(script: string, env: Record<string, string>): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      ["--import", TSX, script],
      /* Only what the test names: the developer's own proxy variables must not reach it. */
      {
        env: { NODE_ENV: "test", PATH: process.env.PATH, ...env },
        encoding: "utf8",
        timeout: 25_000,
      },
      (error, stdout, stderr) =>
        error ? reject(new Error(`${error.message}\n${stderr}`)) : resolve(stdout),
    );
  });
}
