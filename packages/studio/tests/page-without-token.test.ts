/**
 * A page that presented no token — another process on the machine, a
 * visitor of the public demo — is sent what a call carried only as
 * Courier's rules leave it, by every path Studio sends a page anything:
 * the requests replayed as it connects and after the saved sessions are
 * cleared, the saved session the pages show, and a request's whole body it
 * asks for. A page with the token is sent each whole. And nothing writes
 * to a page past the outlet: it holds the adapter every operator of
 * socket.io sends more than one page a message through, the socket of each
 * page without the token, the pages' rooms and which pages presented the
 * token, and no other module reaches below socket.io's operators.
 */
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import type { Socket as ServerSocket } from "socket.io";
import { io as connect, type Socket } from "socket.io-client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createStudioServer } from "../src/server/create-studio-server";
import {
  answeredWithoutToken,
  guardPageWithoutToken,
  shownToPageWithoutToken,
  WITHHELD,
} from "../src/server/page-outlet";
import { TOKEN_HEADER } from "../src/server/token-guard";
import type { StudioServer } from "../src/server/types";
import { sendRuntimeEvents } from "./helpers/runtime-events";

/* What the request carried that no page without the token may see, all made up. */
const SECRETS =
  /made-up-password-0041|made-up-otp-7319|made-up-note-token|made-up-answer-token|made-up-reset-token/;

const VARIABLES = {
  email: "ana@example.test",
  password: "made-up-password-0041",
  otp: "made-up-otp-7319",
  note: "the link https://app.example/cb?token=made-up-note-token came",
};
const ANSWER = {
  token: "made-up-answer-token",
  message: "Reset it at https://app.example/reset?token=made-up-reset-token now",
  label: "Order 1042 shipped",
};

let root: string;
let url: string;
let studio: StudioServer | undefined;
const sockets: Socket[] = [];

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), "courier-page-without-token-"));
  writeFileSync(join(root, "courier.config.ts"), "export default { sources: {} };\n");
  url = await new Promise<string>((done, fail) => {
    studio = createStudioServer({
      port: 0,
      host: "127.0.0.1",
      projectRoot: root,
      onReady: done,
      onError: fail,
    });
  });
});

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.disconnect();
  await studio?.close();
  studio = undefined;
  rmSync(root, { recursive: true, force: true });
});

function token(): string {
  if (!studio) throw new Error("Studio is not running");
  return studio.token;
}

async function post(path: string, body: unknown): Promise<unknown> {
  const response = await fetch(`${url}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: url, [TOKEN_HEADER]: token() },
    body: JSON.stringify(body),
  });
  expect(response.status, path).toBe(200);
  return response.json();
}

/* A page, and everything it is sent, as it arrives. */
interface Page {
  socket: Socket;
  received: unknown[][];
  next(event: string): Promise<unknown>;
}

async function page(presented?: string): Promise<Page> {
  const socket = connect(`${url}/ui`, {
    transports: ["websocket"],
    forceNew: true,
    reconnection: false,
    auth: presented === undefined ? {} : { token: presented },
  });
  sockets.push(socket);
  const received: unknown[][] = [];
  socket.onAny((event: string, ...args: unknown[]) => received.push([event, ...args]));
  /* Sent as the page connects, an event may come before the page asks for it. */
  const next = (event: string) =>
    received.some(([name]) => name === event)
      ? Promise.resolve()
      : new Promise((done) => socket.once(event, done));
  await new Promise<void>((done) => socket.once("connect", () => done()));
  return { socket, received, next };
}

/* The app's runtime: it reports a request, and sends its whole body when Studio asks. */
async function runtime(): Promise<Socket> {
  const socket = connect(`${url}/runtime`, {
    transports: ["websocket"],
    forceNew: true,
    reconnection: false,
  });
  sockets.push(socket);
  socket.on("runtime:body", (asked: { part: string }, answer: (reply: unknown) => void) => {
    answer({ ok: true, data: JSON.stringify(asked.part === "request" ? VARIABLES : ANSWER) });
  });
  await new Promise<void>((done) => socket.once("connect", () => done()));
  socket.emit("runtime:hello", { runtimeId: "server", kind: "server" });
  return socket;
}

/* The request, as the app reports it; settled once a page with the token saw its end. */
async function carried(app: Socket, owner: Page): Promise<void> {
  const ended = owner.next("events");
  sendRuntimeEvents(app, [
    {
      id: "r1",
      type: "request:start",
      timestamp: Date.now(),
      sessionId: "server",
      source: "api",
      method: "login",
      httpMethod: "POST",
      variables: VARIABLES,
    },
    {
      id: "r1",
      requestId: "r1",
      type: "request:end",
      timestamp: Date.now(),
      sessionId: "server",
      status: 200,
      data: ANSWER,
      headers: {},
      requestHeaders: {},
      timing: { total: 1, middleware: 0, fetch: 1, validation: 0 },
      size: 1,
    },
  ]);
  await ended;
}

/* Everything a page was sent, as text: bytes read as the UTF-8 they are. */
function textOf(received: unknown): string {
  const decoded = (value: unknown): unknown => {
    if (value instanceof Uint8Array) return new TextDecoder().decode(value);
    if (Array.isArray(value)) return value.map(decoded);
    if (typeof value === "object" && value !== null) {
      return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, decoded(inner)]));
    }
    return value;
  };
  return JSON.stringify(decoded(received));
}

describe("a page without the token", () => {
  it("is replayed the requests captured before it connected, without their secrets", async () => {
    const app = await runtime();
    const owner = await page(token());
    await carried(app, owner);

    const reader = await page();
    await reader.next("events:replay");
    const ownerAgain = await page(token());
    await ownerAgain.next("events:replay");

    expect(textOf(reader.received)).toContain("Order 1042 shipped");
    expect(textOf(reader.received)).not.toMatch(SECRETS);
    expect(textOf(ownerAgain.received)).toMatch(/made-up-password-0041/);
  });

  it("is shown the saved session the pages show, without its secrets", async () => {
    const saved = (await post("/api/sessions/save", {
      name: "Sign-in",
      requests: [
        {
          id: "r1",
          source: "api",
          method: "login",
          httpMethod: "POST",
          startedAt: 1,
          sessionId: "server",
          variables: VARIABLES,
          data: ANSWER,
          statusCode: 200,
        },
      ],
    })) as { id: string };
    await post("/api/sessions/load", { id: saved.id });

    const reader = await page();
    await reader.next("view:session");
    const owner = await page(token());
    await owner.next("view:session");

    expect(textOf(reader.received)).toContain("Order 1042 shipped");
    expect(textOf(reader.received)).not.toMatch(SECRETS);
    expect(textOf(owner.received)).toMatch(/made-up-password-0041/);
  });

  it("is answered a request's whole body without its secrets", async () => {
    await runtime();
    const reader = await page();
    const owner = await page(token());
    const ask = (asking: Page, part: string) =>
      new Promise((done) =>
        asking.socket.emit("request:body", { sessionId: "server", requestId: "r1", part }, done),
      );

    const [request, response] = [await ask(reader, "request"), await ask(reader, "response")];
    const whole = await ask(owner, "request");

    expect(textOf([request, response])).toContain("Order 1042 shipped");
    expect(textOf([request, response])).not.toMatch(SECRETS);
    expect(textOf(whole)).toMatch(/made-up-password-0041/);
  });

  it("is replayed the live requests after the saved sessions are cleared, without their secrets", async () => {
    const app = await runtime();
    const owner = await page(token());
    await carried(app, owner);
    const reader = await page();
    await new Promise((done) => setTimeout(done, 50));
    reader.received.length = 0;

    const replayed = reader.next("events:replay");
    await post("/api/storage/clear", { kinds: ["sessions"] });
    await replayed;

    expect(textOf(reader.received)).toContain("Order 1042 shipped");
    expect(textOf(reader.received)).not.toMatch(SECRETS);
  });
});

/* Studio's server, as source files: where it could send a page anything. */
function serverSources(): Array<{ file: string; text: string }> {
  const top = resolve(import.meta.dirname, "../src/server");
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? walk(path) : path.endsWith(".ts") ? [path] : [];
    });
  return walk(top).map((path) => ({
    file: relative(top, path).replaceAll("\\", "/"),
    text: readFileSync(path, "utf8"),
  }));
}

/* What only the outlet may touch: the pages' adapter, their rooms, which pages presented the token,
   what its adapter passes on as decided, and — the token guard too — a page admitted as it connects;
   and what writes to a page below socket.io's operators, which no module may: a socket's packets, its
   connection's, its transport, the engine's clients, the outgoing listeners, the operators' own
   prototypes, by getPrototypeOf or __proto__ — named in a call or as a string. */
const BELOW_THE_OUTLET =
  /\.adapter\b|\bTOKEN_PAGES\b|\bREAD_ONLY_PAGES\b|pages:(?:token|read-only)|\badmitTokenPage\b|\bdecided\(|\badmitPage\(|\.packet\(|\b_packet\b|writeToEngine|\.conn\b|engine\.clients|notifyOutgoingListeners|AnyOutgoing\b|prototype\.(?:emit|send|write|packet)\b|(?:getPrototypeOf\([^)]*\)|\.__proto__)\s*\??\.\s*(?:emit|send|write|packet)\b|["'`](?:packet|_packet|writeToEngine|conn)["'`]/g;

/* The outlet's own modules. */
const OUTLET = new Set(["page-outlet.ts", "page-broadcasts.ts", "page-packets.ts"]);

describe("what Studio sends a page", () => {
  it("leaves the outlet alone to hold the pages' adapter, rooms and token, and none to write below socket.io", () => {
    const admitted = "ui-token-guard.ts: admitPage(";
    const found = serverSources()
      .filter(({ file }) => !OUTLET.has(file))
      .flatMap(({ file, text }) =>
        [...text.matchAll(BELOW_THE_OUTLET)]
          .filter(
            (match) =>
              !/^\s*(\*|\/\/)/.test(
                text.slice(text.lastIndexOf("\n", match.index) + 1, match.index),
              ),
          )
          .map((match) => `${file}: ${match[0]}`),
      )
      .filter((line) => line !== admitted);

    expect(found).toEqual([]);
  });
});

describe("the outlet a page without the token is sent everything through", () => {
  it("sends such a page no event it does not name, even by the page's own socket", () => {
    const sent: unknown[][] = [];
    const socket = { emit: (...args: unknown[]) => sent.push(args) } as unknown as ServerSocket;
    guardPageWithoutToken(socket);

    socket.emit("made-up:event", { password: "made-up-password-0041" });
    socket.emit("studio:read-only", { event: "requests:clear", error: "refused" });

    expect(shownToPageWithoutToken("made-up:event", {})).toBe(WITHHELD);
    expect(sent).toEqual([["studio:read-only", { event: "requests:clear", error: "refused" }]]);
  });

  it("answers a mock's whole body and its records without their secrets", () => {
    const body = answeredWithoutToken("mock:body", { ok: true, data: JSON.stringify(VARIABLES) });
    const store = answeredWithoutToken("mock:store:get", {
      ok: true,
      serverId: "shop",
      collections: [{ name: "users", count: 1, records: [VARIABLES] }],
    });
    const text = answeredWithoutToken("mock:body", { ok: true, data: VARIABLES.note });

    expect(textOf([body, store, text])).not.toMatch(SECRETS);
    expect(textOf(store)).toContain("ana@example.test");
  });

  it("sends such a page the pages' drafts without their secrets, and no import left unfinished", () => {
    const drafts = {
      headers: '{ "Authorization": "Bearer made-up-answer-token" }',
      variables: VARIABLES,
    };
    const state = shownToPageWithoutToken("page:state", {
      writable: false,
      state: {
        "playground.drafts": drafts,
        "apis.import": { from: "https://made-up-note-token@x" },
      },
    });

    expect(textOf(state)).not.toMatch(SECRETS);
    expect(shownToPageWithoutToken("page:state:changed", { key: "apis.import", value: {} })).toBe(
      WITHHELD,
    );
  });
});
