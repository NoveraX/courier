/**
 * A client certificate for one group of an API, or for one call, against a
 * server that asks for one, as a bank's API does: the group's calls,
 * streams and channels present it, and so do the groups inside it; the
 * API's other groups present none and are refused; a call presents its own
 * over its group's. The certificate's key kept under a passphrase, as
 * `openssl genrsa -des3` writes it; a PKCS#12 bundle, as `openssl pkcs12
 * -export` writes it; TLS 1.2 pinned; and a renewed certificate taken while
 * the process runs.
 */
import { execFileSync } from "node:child_process";
import { createPrivateKey } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:https";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TLSSocket } from "node:tls";
import { Agent, WebSocket as UndiciWebSocket, fetch as undiciFetch } from "undici";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WebSocketServer } from "ws";

import { createWSHandler } from "../src/adapter/handle-ws";
import type { WSHandler } from "../src/adapter/ws-types";
import { createCaller } from "../src/caller";
import { defineApi } from "../src/define/api";
import { courier } from "../src/define/courier";
import { defineGroup } from "../src/define/group";
import type { SourceDispatcher } from "../src/http-client/source-transport";
import { attachWebSocketUpgrade, type UpgradeServer } from "../src/node";
import { clearWSConnectionPool } from "../src/realtime/caller-ws";
import { _resetSourcesForTests, registerSources } from "../src/sources";
import { type IssuedCertificate, testCertificates } from "./helpers/test-certificates";

const { endpoint, stream, channel } = courier();
const certificates = testCertificates();
const PASSPHRASE = "s3cret passphrase";

let handler: WSHandler;
let server: Server;
let baseURL: string;
const agents: Agent[] = [];

beforeAll(async () => {
  registerSources({
    api: defineApi({
      name: "api",
      baseURL: "http://127.0.0.1:1",
      groups: {
        settlement: defineGroup({
          prefix: "settlement",
          endpoints: {
            greeting: channel.response<string>().implement(async function* () {
              yield "hello";
            }),
          },
        }),
      },
    }),
  } as never);
  handler = createWSHandler();
  /* Asks every client for a certificate the authority issued, and says which one came, over which TLS. */
  server = createServer(
    { ...certificates.server, ca: certificates.ca, requestCert: true, rejectUnauthorized: true },
    (req, res) => {
      if (req.url?.endsWith("/ticks")) {
        res.writeHead(200, { "content-type": "text/event-stream" });
        return void res.end("data: 1\n\ndata: 2\n\nevent: courier:complete\ndata: null\n\n");
      }
      const socket = req.socket as TLSSocket;
      const client = socket.getPeerCertificate().subject?.CN ?? null;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ client, protocol: socket.getProtocol() }));
    },
  );
  attachWebSocketUpgrade(server, {
    path: undefined,
    createServer: (options) => new WebSocketServer(options) as unknown as UpgradeServer,
    onSocket: (socket, request) => handler.handleSocket(socket, request),
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseURL = `https://localhost:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  clearWSConnectionPool();
  _resetSourcesForTests();
  /* The renewed certificate's test closed the agent it retired. */
  await Promise.all(agents.filter((agent) => !agent.closed).map((agent) => agent.close()));
  await handler.destroy();
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

/* An undici Agent that trusts the test authority and, given one, presents a client certificate over TLS 1.2. */
function agentWith(connect: object = {}): Agent {
  const agent = new Agent({
    connect: { ca: certificates.ca, minVersion: "TLSv1.2", maxVersion: "TLSv1.2", ...connect },
  });
  agents.push(agent);
  return agent;
}

/* The certificate with its key encrypted under the passphrase, as `openssl genrsa -des3` keeps it. */
function encrypted(issued: IssuedCertificate): { cert: string; key: string; passphrase: string } {
  const key = createPrivateKey(issued.key).export({
    type: "pkcs8",
    format: "pem",
    cipher: "aes-256-cbc",
    passphrase: PASSPHRASE,
  });
  return { cert: issued.cert, key: key.toString(), passphrase: PASSPHRASE };
}

/* The bank's API: trusted by every group, a client certificate presented by `settlement` alone. */
function bank(settlement: SourceDispatcher) {
  return defineApi({
    name: "api",
    baseURL,
    dispatcher: agentWith(),
    fetch: undiciFetch,
    webSocket: UndiciWebSocket,
    groups: {
      settlement: defineGroup({
        prefix: "settlement",
        dispatcher: settlement,
        endpoints: {
          who: endpoint.get("who"),
          ticks: stream.response<number>().get("ticks"),
          greeting: channel.response<string>().connect("greeting"),
        },
        groups: {
          refunds: defineGroup({ prefix: "refunds", endpoints: { who: endpoint.get("who") } }),
        },
      }),
      catalog: defineGroup({ prefix: "catalog", endpoints: { who: endpoint.get("who") } }),
    },
  });
}

describe("a client certificate for one group", () => {
  it("is presented on the group's calls, streams and channels, and those of the groups inside it", async () => {
    const client = createCaller(bank(agentWith(encrypted(certificates.client))));

    const call = await client.settlement.who();
    const ticks: unknown[] = [];
    for await (const tick of client.settlement.ticks()) ticks.push(tick.data);
    let greeting: unknown;
    for await (const message of client.settlement.greeting()) {
      greeting = message.data;
      break;
    }
    const inner = await client.settlement.refunds.who();

    expect(call).toEqual({ client: "courier-client", protocol: "TLSv1.2" });
    expect(ticks).toEqual([1, 2]);
    expect(greeting).toBe("hello");
    expect(inner).toEqual({ client: "courier-client", protocol: "TLSv1.2" });
  });

  it("is not presented by the API's other groups, which the server refuses", async () => {
    const client = createCaller(bank(agentWith(encrypted(certificates.client))));

    await expect(client.catalog.who()).rejects.toThrow();
  });
});

describe("a client certificate for one call", () => {
  it("is presented by that call alone, over its group's and its API's", async () => {
    const own = certificates.issueClient("courier-call");
    const client = createCaller(bank(agentWith(encrypted(certificates.client))));
    const dispatcher = agentWith(own);

    const outside = await client.catalog.with({ dispatcher }).who();
    const over = await client.settlement.with({ dispatcher }).who();
    const after = await client.settlement.who();

    expect(outside).toEqual({ client: "courier-call", protocol: "TLSv1.2" });
    expect(over).toEqual({ client: "courier-call", protocol: "TLSv1.2" });
    expect(after).toEqual({ client: "courier-client", protocol: "TLSv1.2" });
  });
});

describe("a certificate kept as a bank issues it", () => {
  it.runIf(hasOpenssl())("is read from a PKCS#12 bundle under its passphrase", async () => {
    const directory = mkdtempSync(join(tmpdir(), "courier-pfx-"));
    const { cert, key } = certificates.client;
    writeFileSync(join(directory, "company.cer"), cert);
    writeFileSync(join(directory, "company.key"), key);
    writeFileSync(join(directory, "ca.cer"), certificates.ca);
    execFileSync("openssl", [
      "pkcs12",
      "-export",
      "-out",
      join(directory, "company.pfx"),
      "-inkey",
      join(directory, "company.key"),
      "-in",
      join(directory, "company.cer"),
      "-certfile",
      join(directory, "ca.cer"),
      "-passout",
      `pass:${PASSPHRASE}`,
    ]);
    const pfx = readFileSync(join(directory, "company.pfx"));
    rmSync(directory, { recursive: true, force: true });
    const client = createCaller(bank(agentWith({ pfx, passphrase: PASSPHRASE })));

    expect(await client.settlement.who()).toEqual({
      client: "courier-client",
      protocol: "TLSv1.2",
    });
  });

  it("is renewed while the process runs, the next connection presenting the new one", async () => {
    let current = agentWith(encrypted(certificates.client));
    const renewable: SourceDispatcher = {
      dispatch: (options, handler) => current.dispatch(options as never, handler as never),
    };
    const client = createCaller(bank(renewable));
    const before = await client.settlement.who();

    const retired = current;
    current = agentWith(encrypted(certificates.issueClient("courier-client-renewed")));
    await retired.close();
    const after = await client.settlement.who();

    expect(before).toEqual({ client: "courier-client", protocol: "TLSv1.2" });
    expect(after).toEqual({ client: "courier-client-renewed", protocol: "TLSv1.2" });
  });
});

function hasOpenssl(): boolean {
  try {
    execFileSync("openssl", ["version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
