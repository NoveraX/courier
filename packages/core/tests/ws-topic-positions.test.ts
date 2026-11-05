/**
 * Where each subscription stands in its topic's sequence, on a socket the
 * test speaks for the server: `subscribed` gives the position, each event
 * and `skip` moves it on by one, and `resync` sets it anew. A subscription
 * made again after a drop sends the position as `since`; it hears it
 * resumed only when the server says every missed event was sent, and hears
 * `resumed: false` whenever the server cannot vouch for what it missed.
 * Frames without a number — a snapshot, a push value — are always delivered.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createWSConnection } from "../src/realtime/ws/ws-connection";
import type { TopicOpenInfo, WSClientSocket, WSConnection } from "../src/realtime/ws/ws-types";
import { admission } from "./helpers/admission";

const TOPIC = "api.chat.room";

class ServerSide implements WSClientSocket {
  readyState = 0;
  bufferedAmount = 0;
  onopen: WSClientSocket["onopen"] = null;
  onmessage: WSClientSocket["onmessage"] = null;
  onclose: WSClientSocket["onclose"] = null;
  onerror: WSClientSocket["onerror"] = null;
  readonly sent: string[] = [];

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = 3;
  }

  /** The socket opens and the server admits it. */
  admit(): void {
    this.readyState = 1;
    this.onopen?.({});
    this.says(JSON.parse(admission(this.sent)));
  }

  says(frame: Record<string, unknown>): void {
    this.onmessage?.({ data: JSON.stringify(frame) });
  }

  /** The topic's subscribe the client sent last on this socket. */
  subscribe(): Record<string, unknown> {
    const frames = this.sent.map((frame) => JSON.parse(frame) as Record<string, unknown>);
    const found = frames.findLast((frame) => frame.type === "subscribe" && frame.topic === TOPIC);
    if (!found) throw new Error("the client sent no subscribe for the topic");
    return found;
  }

  /** The server runs the subscription, the topic's sequence at `seq`. */
  subscribed(seq: number, extra: Record<string, unknown> = {}): void {
    this.says({
      type: "subscribed",
      id: this.subscribe().id,
      topic: TOPIC,
      seq,
      epoch: "e1",
      ...extra,
    });
  }

  event(seq: number, payload: unknown = `event ${seq}`): void {
    this.says({ type: "data", topic: TOPIC, seq, payload });
  }

  drops(): void {
    this.readyState = 3;
    this.onclose?.({ code: 1006, reason: "" });
  }
}

let sockets: ServerSide[] = [];
let connection: WSConnection | undefined;
let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"], shouldClearNativeTimers: true });
  warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  sockets = [];
});

afterEach(() => {
  connection?.close();
  connection = undefined;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** A connection subscribed to the topic, its socket admitted: what it heard, and the socket. */
function subscribed() {
  connection = createWSConnection({
    url: "ws://test/ws",
    socketFactory: () => {
      const socket = new ServerSide();
      sockets.push(socket);
      return socket;
    },
    backoff: { initialMs: 100, jitter: false },
    reconnectOnResume: false,
  });
  const heard: unknown[] = [];
  const opens: TopicOpenInfo[] = [];
  connection.subscribe(TOPIC, {
    data: (payload) => heard.push(payload),
    open: (info) => opens.push(info),
  });
  socket().admit();
  return { heard, opens };
}

function socket(): ServerSide {
  const last = sockets.at(-1);
  if (!last) throw new Error("no socket was opened");
  return last;
}

/** The socket drops, and the next is opened, once the backoff has passed, and admitted. */
function reconnect(): void {
  const opened = sockets.length;
  socket().drops();
  for (let waited = 0; sockets.length === opened && waited < 10_000; waited += 100) {
    vi.advanceTimersByTime(100);
  }
  socket().admit();
}

describe("a subscription's position", () => {
  it("is not sent on the first subscribe", () => {
    subscribed();

    expect(socket().subscribe()).not.toHaveProperty("since");
  });

  it("is sent as since when the subscription is made again: the last event counted", () => {
    subscribed();
    socket().subscribed(41);
    socket().event(42);
    socket().says({ type: "skip", topic: TOPIC, seq: 43 });

    reconnect();

    expect(socket().subscribe()).toMatchObject({ since: { seq: 43, epoch: "e1" } });
  });

  it("is the server's after subscribed, though events numbered beyond it came first", () => {
    const { heard } = subscribed();
    socket().event(42, "during onJoin");
    socket().subscribed(41);

    reconnect();

    expect(heard).toEqual(["during onJoin"]);
    expect(socket().subscribe()).toMatchObject({ since: { seq: 41, epoch: "e1" } });
  });

  it("is set anew by resync, which the subscription hears as an open that did not resume", () => {
    const { opens } = subscribed();
    socket().subscribed(41);

    socket().says({ type: "resync", topic: TOPIC, seq: 7, epoch: "e2" });
    reconnect();

    expect(opens).toEqual([{ resumed: false }, { resumed: false }]);
    expect(socket().subscribe()).toMatchObject({ since: { seq: 7, epoch: "e2" } });
  });
});

describe("a subscription made again", () => {
  it("hears it resumed when the server sent every event it missed", () => {
    const { heard, opens } = subscribed();
    socket().subscribed(41);
    reconnect();

    socket().event(42);
    socket().subscribed(42, { recovered: true });

    expect(heard).toEqual(["event 42"]);
    expect(opens.at(-1)).toEqual({ resumed: true });
  });

  it("hears it did not resume when the server could not send what it missed", () => {
    const { opens } = subscribed();
    socket().subscribed(41);
    reconnect();

    socket().subscribed(90, { epoch: "e2", recovered: false });
    reconnect();

    expect(opens.at(-1)).toEqual({ resumed: false });
    expect(socket().subscribe()).toMatchObject({ since: { seq: 90, epoch: "e2" } });
  });

  it("hears it did not resume when the topic's sequence broke before it was running", () => {
    const { opens } = subscribed();
    socket().subscribed(41);
    reconnect();

    socket().says({ type: "resync", topic: TOPIC, seq: 50, epoch: "e1" });
    socket().subscribed(50, { recovered: true });

    expect(opens.at(-1)).toEqual({ resumed: false });
  });
});

describe("a running subscription", () => {
  it("drops an event it counted already", () => {
    const { heard } = subscribed();
    socket().subscribed(41);

    socket().event(42);
    socket().event(42);
    socket().event(41);

    expect(heard).toEqual(["event 42"]);
  });

  it("takes a gap in the numbers for a break, delivering what came and warning of it", () => {
    const { heard, opens } = subscribed();
    socket().subscribed(41);

    socket().event(45);

    expect(heard).toEqual(["event 45"]);
    expect(opens).toEqual([{ resumed: false }, { resumed: false }]);
    expect(String(warn.mock.calls.at(-1))).toContain("Events 42 to 44 of api.chat.room never came");
  });

  it("delivers every frame that carries no number, a snapshot and a push value", () => {
    const { heard } = subscribed();
    socket().says({ type: "data", topic: TOPIC, payload: "snapshot" });
    socket().subscribed(41);

    socket().says({ type: "data", topic: TOPIC, payload: "yours" });
    socket().says({ type: "data", topic: TOPIC, payload: "yours" });

    expect(heard).toEqual(["snapshot", "yours", "yours"]);
  });
});
