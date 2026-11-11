/**
 * Every way socket.io sends a page a message — a namespace's operators, a
 * page's own, the sockets a namespace fetches, a socket of another server —
 * reaches a page without the project's token only as the page outlet's
 * rules leave it, and a page with the token whole: the outlet holds the
 * adapter every message to more than one page goes through, and the socket
 * of each page without the token and the packets its connection writes.
 * The operators are the ones the installed socket.io has, each named here
 * as sending a page a message or not, so a version that adds one fails
 * here until it is named.
 */
import { createServer } from "node:http";
import { createRequire } from "node:module";
import type { AddressInfo } from "node:net";
import { dirname, join } from "node:path";
import { Namespace, Server, Socket as ServerSocket } from "socket.io";
import { io as connect, type Socket } from "socket.io-client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { guardPageBroadcasts, shownToPageWithoutToken } from "../src/server/page-outlet";
import type { StudioToken } from "../src/server/studio-token";
import { guardUiWrites } from "../src/server/ui-token-guard";

const TOKEN = "made-up-page-token";
const SECRET = "made-up-password-0041";

/* What a call carried, as the live traffic sends it: a page without the token is sent it cut. */
const batch = (way: string) => [
  { type: "request:start", id: way, variables: { password: SECRET, label: way } },
];

/* What each way sends: the live traffic; an event the outlet does not name, which a page without the
   token is not sent; and one whose caller cuts it, sent past its caller, which it is not sent either. */
const MESSAGES: ReadonlyArray<readonly [string, (way: string) => unknown]> = [
  ["events", batch],
  ["made-up:event", (way) => ({ way, password: SECRET })],
  ["config:status", (way) => ({ way, password: SECRET })],
];

type Send = (event: string, payload: unknown) => unknown;

interface Way {
  /** The operators it sends by, as `Class.operator` */
  by: string[];
  /** The pages it reaches */
  reaches: { withToken: boolean; withoutToken: boolean };
  /** How it sends one message, or `message` for a way that names no event of its own */
  send: (pages: Namespace, sides: Sides) => Send | Promise<Send>;
  /** A volatile message is let go while the page's transport writes the one before: it sends one */
  one?: boolean;
  message?: boolean;
}

interface Sides {
  withToken: ServerSocket;
  withoutToken: ServerSocket;
}

const BOTH = { withToken: true, withoutToken: true };
const OTHERS = { withToken: false, withoutToken: true };

const load = createRequire(import.meta.url);
/* socket.io keeps it out of its exports; a socket another server holds is one. */
const { RemoteSocket } = load(
  join(dirname(load.resolve("socket.io")), "broadcast-operator.js"),
) as {
  RemoteSocket: new (
    adapter: unknown,
    details: unknown,
  ) => { emit: Send; timeout(ms: number): { emit: Send } };
};

/* socket.io keeps it out of its exports too: the connection every packet of a page's socket ends in. */
const { Client } = load(join(dirname(load.resolve("socket.io")), "client.js")) as {
  Client: { prototype: object };
};

/* What every packet of a page's socket ends in, which its type keeps for socket.io's own. */
const connection = (side: ServerSocket) =>
  side.client as unknown as { _packet(packet: unknown, opts?: unknown): void };

/* The packet of a page's socket, off its prototype, as socket.io's own emit calls it. */
type Written = { call(side: ServerSocket, packet: unknown, opts?: unknown): void };

const remote = (pages: Namespace, side: ServerSocket) =>
  new RemoteSocket(pages.adapter, {
    id: side.id,
    handshake: side.handshake,
    rooms: [...side.rooms],
    data: {},
  });

const WAYS: Readonly<Record<string, Way>> = {
  "the namespace's emit": {
    by: ["Namespace.emit", "BroadcastOperator.emit"],
    reaches: BOTH,
    send: (pages) => (event, payload) => pages.emit(event, payload),
  },
  "a room": {
    by: ["Namespace.to", "BroadcastOperator.to"],
    reaches: BOTH,
    send: (pages) => (event, payload) => pages.to("all").to("all").emit(event, payload),
  },
  "in a room": {
    by: ["Namespace.in", "BroadcastOperator.in"],
    reaches: BOTH,
    send: (pages) => (event, payload) => pages.in("all").in("all").emit(event, payload),
  },
  "but a room": {
    by: ["Namespace.except", "BroadcastOperator.except"],
    reaches: BOTH,
    send: (pages) => (event, payload) => pages.except("none").except("none").emit(event, payload),
  },
  compressed: {
    by: ["Namespace.compress", "BroadcastOperator.compress"],
    reaches: BOTH,
    send: (pages) => (event, payload) => pages.compress(false).compress(true).emit(event, payload),
  },
  volatile: {
    by: ["Namespace.volatile", "BroadcastOperator.volatile"],
    reaches: BOTH,
    one: true,
    send: (pages) => (event, payload) => pages.to("all").volatile.emit(event, payload),
  },
  local: {
    by: ["Namespace.local", "BroadcastOperator.local"],
    reaches: BOTH,
    send: (pages) => (event, payload) => pages.local.to("all").local.emit(event, payload),
  },
  "with a timeout, answered by none": {
    by: ["Namespace.timeout", "BroadcastOperator.timeout"],
    reaches: BOTH,
    send: (pages) => (event, payload) =>
      pages.timeout(5000).to("all").timeout(5000).emit(event, payload),
  },
  "waiting for each page's answer": {
    by: ["BroadcastOperator.emit"],
    reaches: { withToken: true, withoutToken: false },
    send: (pages) => (event, payload) =>
      new Promise((done) => pages.timeout(5000).emit(event, payload, done)),
  },
  "waiting for each page's answer, as a promise": {
    by: ["BroadcastOperator.emitWithAck"],
    reaches: { withToken: true, withoutToken: false },
    send: (pages) => (event, payload) => pages.timeout(5000).emitWithAck(event, payload),
  },
  "the namespace's send": {
    by: ["Namespace.send"],
    reaches: BOTH,
    message: true,
    send: (pages) => (_event, payload) => pages.send(payload),
  },
  "the namespace's write": {
    by: ["Namespace.write"],
    reaches: BOTH,
    message: true,
    send: (pages) => (_event, payload) => pages.write(payload),
  },
  "the sockets it fetches": {
    by: ["Namespace.fetchSockets", "BroadcastOperator.fetchSockets"],
    reaches: BOTH,
    send: async (pages) => {
      const sockets = await pages.fetchSockets();
      return (event, payload) => {
        for (const socket of sockets) socket.emit(event, payload);
      };
    },
  },
  "a socket of another server": {
    by: ["RemoteSocket.emit", "RemoteSocket.timeout"],
    reaches: BOTH,
    send:
      (pages, { withToken, withoutToken }) =>
      (event, payload) => {
        remote(pages, withToken).emit(event, payload);
        remote(pages, withoutToken).timeout(5000).emit(event, payload);
      },
  },
  "a page's broadcast": {
    by: ["Socket.broadcast"],
    reaches: OTHERS,
    send:
      (_pages, { withToken }) =>
      (event, payload) =>
        withToken.broadcast.emit(event, payload),
  },
  "a page's room": {
    by: ["Socket.to"],
    reaches: OTHERS,
    send:
      (_pages, { withToken }) =>
      (event, payload) =>
        withToken.to("all").emit(event, payload),
  },
  "a page's in a room": {
    by: ["Socket.in"],
    reaches: OTHERS,
    send:
      (_pages, { withToken }) =>
      (event, payload) =>
        withToken.in("all").emit(event, payload),
  },
  "a page's but a room": {
    by: ["Socket.except"],
    reaches: OTHERS,
    send:
      (_pages, { withToken }) =>
      (event, payload) =>
        withToken.except("none").emit(event, payload),
  },
  "a page's local": {
    by: ["Socket.local"],
    reaches: OTHERS,
    send:
      (_pages, { withToken }) =>
      (event, payload) =>
        withToken.local.emit(event, payload),
  },
  "each page's own emit": {
    by: ["Socket.emit"],
    reaches: BOTH,
    send: (_pages, sides) => (event, payload) => {
      sides.withToken.emit(event, payload);
      sides.withoutToken.emit(event, payload);
    },
  },
  "each page's own, compressed": {
    by: ["Socket.compress"],
    reaches: BOTH,
    send: (_pages, sides) => (event, payload) => {
      sides.withToken.compress(false).emit(event, payload);
      sides.withoutToken.compress(false).emit(event, payload);
    },
  },
  "each page's own, volatile": {
    by: ["Socket.volatile"],
    reaches: BOTH,
    one: true,
    send: (_pages, sides) => (event, payload) => {
      sides.withToken.volatile.emit(event, payload);
      sides.withoutToken.volatile.emit(event, payload);
    },
  },
  "each page's own, waiting for its answer": {
    by: ["Socket.timeout", "Socket.emitWithAck"],
    reaches: BOTH,
    send: (_pages, sides) => (event, payload) =>
      Promise.all(
        [sides.withToken, sides.withoutToken].map((side) =>
          side
            .timeout(1000)
            .emitWithAck(event, payload)
            .catch(() => "unanswered"),
        ),
      ),
  },
  "each page's own send": {
    by: ["Socket.send"],
    reaches: BOTH,
    message: true,
    send: (_pages, sides) => (_event, payload) => {
      sides.withToken.send(payload);
      sides.withoutToken.send(payload);
    },
  },
  "each page's own write": {
    by: ["Socket.write"],
    reaches: BOTH,
    message: true,
    send: (_pages, sides) => (_event, payload) => {
      sides.withToken.write(payload);
      sides.withoutToken.write(payload);
    },
  },
  /* What no module of Studio's server writes, and the scan of its source looks for: past the
     wrapper of a page's own emit, by its prototype, and past the operators, by the name of what
     every emit of the page ends in. */
  "each page's own emit, off its prototype": {
    by: ["Socket.emit"],
    reaches: BOTH,
    send: (_pages, sides) => (event, payload) => {
      for (const side of [sides.withToken, sides.withoutToken]) {
        Object.getPrototypeOf(side).emit.call(side, event, payload);
      }
    },
  },
  "each page's own packet, by its name": {
    by: ["Socket.packet"],
    reaches: BOTH,
    send: (_pages, sides) => (event, payload) => {
      for (const side of [sides.withToken, sides.withoutToken]) {
        const packet = side as unknown as Record<string, ((written: unknown) => void) | undefined>;
        // biome-ignore lint/complexity/useLiteralKeys: the way past the scan names the member so
        packet["packet"]?.({ type: 2, data: [event, payload] });
      }
    },
  },
  "each page's own packet, off its prototype": {
    by: ["Socket.packet"],
    reaches: BOTH,
    send: (_pages, sides) => (event, payload) => {
      for (const side of [sides.withToken, sides.withoutToken]) {
        const written: Written = Object.getPrototypeOf(side).packet;
        written.call(side, { type: 2, data: [event, payload] });
      }
    },
  },
  "each page's own packet, off its prototype kept aside": {
    by: ["Socket.packet"],
    reaches: BOTH,
    send: (_pages, sides) => (event, payload) => {
      for (const side of [sides.withToken, sides.withoutToken]) {
        const proto: { packet: Written } = Object.getPrototypeOf(side);
        proto.packet.call(side, { type: 2, data: [event, payload] });
      }
    },
  },
  "each page's own packet, off its __proto__": {
    by: ["Socket.packet"],
    reaches: BOTH,
    send: (_pages, sides) => (event, payload) => {
      for (const side of [sides.withToken, sides.withoutToken]) {
        const own = side as unknown as { __proto__: { packet: Written } };
        // biome-ignore lint/suspicious/noProto: the way past the scan reads the prototype so
        own.__proto__.packet.call(side, { type: 2, data: [event, payload] });
      }
    },
  },
  "each page's own packet, encoded already": {
    by: ["Socket.packet"],
    reaches: { withToken: true, withoutToken: false },
    send: (_pages, sides) => (event, payload) => {
      for (const side of [sides.withToken, sides.withoutToken]) {
        const written: Written = Object.getPrototypeOf(side).packet;
        written.call(side, [`2/ui,${JSON.stringify([event, payload])}`], { preEncoded: true });
      }
    },
  },
  "the packet of each page's connection": {
    by: ["Client._packet"],
    reaches: BOTH,
    send: (_pages, sides) => (event, payload) => {
      for (const side of [sides.withToken, sides.withoutToken]) {
        connection(side)._packet({ type: 2, nsp: "/ui", data: [event, payload] });
      }
    },
  },
};

/* Each other operator of the socket.io installed, and what it does: the ones that send a page nothing
   a call carried, the answer to what a page asked, and what writes to a page past every rule. */
const QUIET: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  Namespace: {
    _initAdapter: "makes the adapter",
    use: "adds a middleware",
    run: "runs the middlewares",
    _add: "takes a client in",
    _createSocket: "makes a socket",
    _doConnect: "tells a page it connected",
    _remove: "lets a socket go",
    serverSideEmit: "sends the other servers",
    serverSideEmitWithAck: "sends the other servers",
    _onServerSideEmit: "reads what another server sent",
    allSockets: "lists the sockets",
    socketsJoin: "puts sockets in rooms",
    socketsLeave: "takes sockets out of rooms",
    disconnectSockets: "tells pages to go",
  },
  BroadcastOperator: {
    allSockets: "lists the sockets",
    socketsJoin: "puts sockets in rooms",
    socketsLeave: "takes sockets out of rooms",
    disconnectSockets: "tells pages to go",
  },
  Socket: {
    buildHandshake: "reads the handshake",
    registerAckCallback: "waits for an answer",
    join: "joins a room",
    leave: "leaves a room",
    leaveAll: "leaves every room",
    _onconnect: "tells the page it connected",
    _onpacket: "reads what the page sent",
    onevent: "reads what the page sent",
    ack: "answers what the page asked: the token guard cuts the answer to a page without the token",
    onack: "reads the page's answer",
    ondisconnect: "reads that the page went",
    _onerror: "reads an error",
    _onclose: "lets the page go",
    _cleanup: "lets the page go",
    _error: "tells the page why it could not connect",
    disconnect: "tells the page to go",
    dispatch: "runs the handlers",
    use: "adds a middleware",
    run: "runs the middlewares",
    disconnected: "says whether the page went",
    request: "the page's request",
    rooms: "the page's rooms",
    onAny: "listens",
    prependAny: "listens",
    offAny: "stops listening",
    listenersAny: "lists listeners",
    onAnyOutgoing: "listens",
    prependAnyOutgoing: "listens",
    offAnyOutgoing: "stops listening",
    listenersAnyOutgoing: "lists listeners",
    notifyOutgoingListeners: "tells the listeners",
    newBroadcastOperator:
      "makes the operators `to`, `in`, `except`, `broadcast` and `local` return",
    conn: "the page's transport, past every rule: no module of Studio's server reads it",
  },
  RemoteSocket: {
    join: "puts it in a room",
    leave: "takes it out of a room",
    disconnect: "tells it to go",
  },
  Client: {
    request: "the page's request",
    setup: "takes the connection in",
    connect: "connects a namespace",
    doConnect: "connects a namespace",
    _disconnect: "lets every namespace go",
    _remove: "lets a socket go",
    close: "closes the connection",
    writeToEngine:
      "writes what was encoded, past every rule: the adapter, which the outlet holds, and no module of Studio's server",
    ondata: "reads what the page sent",
    ondecoded: "reads what the page sent",
    _parseNamespace: "reads the namespace the page named",
    onerror: "reads an error",
    onclose: "lets the connection go",
    destroy: "lets the connection go",
  },
};

interface Page {
  socket: Socket;
  received: unknown[][];
  /* Settled once the page was sent the message that ends a way. */
  after(way: string): Promise<void>;
}

let io: Server;
let pages: Namespace;
let sides: Sides;
let withToken: Page;
let withoutToken: Page;

async function page(url: string, token?: string): Promise<Page> {
  const socket = connect(`${url}/ui`, {
    transports: ["websocket"],
    forceNew: true,
    reconnection: false,
    auth: token === undefined ? {} : { token },
  });
  const received: unknown[][] = [];
  const waiting = new Map<string, () => void>();
  socket.onAny((event: string, ...args: unknown[]) => {
    const answer = args.at(-1);
    if (typeof answer === "function") {
      args.pop();
      (answer as (reply: unknown) => void)("seen");
    }
    const [payload] = args;
    if (event === "studio:info" && typeof payload === "object" && payload !== null) {
      waiting.get(String((payload as { after?: unknown }).after))?.();
      return;
    }
    received.push([event, ...args]);
  });
  await new Promise<void>((done) => socket.once("connect", () => done()));
  return {
    socket,
    received,
    after: (way) => new Promise((done) => waiting.set(way, done)),
  };
}

beforeAll(async () => {
  const http = createServer();
  io = new Server(http);
  /* Another namespace a page's connection may carry beside the pages'. */
  io.of("/other");
  pages = io.of("/ui");
  guardPageBroadcasts(pages);
  const token = { value: TOKEN, matches: (presented: unknown) => presented === TOKEN };
  pages.on("connection", (socket) => {
    guardUiWrites(socket, token as StudioToken);
    void socket.join("all");
  });
  await new Promise<void>((done) => http.listen(0, "127.0.0.1", done));
  const url = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
  withToken = await page(url, TOKEN);
  withoutToken = await page(url);
  const side = (client: Page) => {
    const socket = pages.sockets.get(client.socket.id ?? "");
    if (!socket) throw new Error("no socket for the page");
    return socket;
  };
  sides = { withToken: side(withToken), withoutToken: side(withoutToken) };
});

afterAll(async () => {
  withToken.socket.disconnect();
  withoutToken.socket.disconnect();
  await io.close();
});

/* Which way a message was sent by: each names it. */
function wayOf([, payload]: unknown[]): unknown {
  const first: unknown = Array.isArray(payload) ? payload[0] : payload;
  if (typeof first !== "object" || first === null) return undefined;
  return "id" in first ? first.id : "way" in first ? first.way : undefined;
}

describe("every way socket.io sends a page a message", () => {
  for (const [way, { send, reaches, one, message }] of Object.entries(WAYS)) {
    it(`reaches a page without the token cut, and one with it whole: ${way}`, async () => {
      const sending = await send(pages, sides);
      const sent = (one ? MESSAGES.slice(0, 1) : MESSAGES).map(
        ([event, payload]) => [message ? "message" : event, payload(way)] as const,
      );
      const ended = [withToken.after(way), withoutToken.after(way)];

      await Promise.all(sent.map(([event, payload]) => sending(event, payload)));
      pages.emit("studio:info", { after: way });
      await Promise.all(ended);

      const to = (client: Page) => client.received.filter((received) => wayOf(received) === way);
      const cut = sent.flatMap(([event, payload]) => {
        const shown = message ? undefined : shownToPageWithoutToken(event, payload);
        return shown === undefined || typeof shown === "symbol" ? [] : [[event, shown]];
      });
      expect(to(withToken)).toEqual(reaches.withToken ? sent.map((entry) => [...entry]) : []);
      expect(to(withoutToken)).toEqual(reaches.withoutToken ? cut : []);
      expect(JSON.stringify(to(withoutToken))).not.toContain(SECRET);
    });
  }

  it("tells an emit that waits for a page without the token's answer to what it withholds that none came", async () => {
    const { withoutToken: side } = sides;

    const unanswered = side.timeout(100).emitWithAck("made-up:event", { password: SECRET });
    side.volatile.compress(false).emit("made-up:event", { password: SECRET });

    await expect(unanswered).rejects.toThrow("operation has timed out");
    /* What `volatile`, `compress` and `timeout` set passed to no message after. */
    expect(Reflect.get(side, "flags")).toEqual({});
  });

  it("writes the packet of another namespace a page without the token's connection carries as it is", async () => {
    const other = withoutToken.socket.io.socket("/other");
    const received = new Promise<unknown[]>((done) =>
      other.once("made-up:event", (...args: unknown[]) => done(args)),
    );
    await new Promise<void>((done) => other.once("connect", () => done()));

    connection(sides.withoutToken)._packet({
      type: 2,
      nsp: "/other",
      data: ["made-up:event", { way: "another namespace", password: SECRET }],
    });

    expect(await received).toEqual([{ way: "another namespace", password: SECRET }]);
    other.disconnect();
  });

  it("names every operator the socket.io installed has, and sends by each that sends", () => {
    const classes = {
      Namespace,
      BroadcastOperator: Object.getPrototypeOf(pages.to("all")).constructor,
      Socket: ServerSocket,
      RemoteSocket,
      Client,
    };
    const sending = new Set(Object.values(WAYS).flatMap(({ by }) => by));

    for (const [name, made] of Object.entries(classes)) {
      const operators = Object.getOwnPropertyNames(made.prototype).filter(
        (operator) => operator !== "constructor",
      );
      const named = (operator: string) =>
        sending.has(`${name}.${operator}`) || QUIET[name]?.[operator] !== undefined;

      expect(
        operators.filter((operator) => !named(operator)),
        name,
      ).toEqual([]);
      expect(
        [...sending].filter(
          (by) => by.startsWith(`${name}.`) && !operators.includes(by.slice(name.length + 1)),
        ),
        name,
      ).toEqual([]);
    }
  });
});
