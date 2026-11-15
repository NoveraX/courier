/**
 * Two subscriptions to one topic on one connection, one after the other:
 * the end of an earlier subscribe — one the client left before the server
 * heard it — does not end the subscription made after it; and of two the
 * server took for one, the newer's variables are what a reconnect
 * subscribes with, as the server holds them.
 *
 * The socket is a stand-in the test opens, admits and answers for the server.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RealtimeError } from "../src/realtime/errors";
import { createWSConnection } from "../src/realtime/ws/ws-connection";
import { encodeMessage, type WSMessage } from "../src/realtime/ws/ws-protocol";
import type { WSClientSocket } from "../src/realtime/ws/ws-types";
import { admission } from "./helpers/admission";

/** A socket the test answers for the server. */
class StandInSocket implements WSClientSocket {
  static opened: StandInSocket[] = [];
  readyState = 0;
  bufferedAmount = 0;
  onopen: WSClientSocket["onopen"] = null;
  onmessage: WSClientSocket["onmessage"] = null;
  onclose: WSClientSocket["onclose"] = null;
  onerror: WSClientSocket["onerror"] = null;
  readonly sent: string[] = [];

  constructor() {
    StandInSocket.opened.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = 3;
  }

  admit(): void {
    this.readyState = 1;
    this.onopen?.({});
    this.receive(admission(this.sent));
  }

  drop(): void {
    this.readyState = 3;
    this.onclose?.({ code: 1006, reason: "" });
  }

  receive(frame: string | WSMessage): void {
    this.onmessage?.({ data: typeof frame === "string" ? frame : encodeMessage(frame) });
  }

  /** The subscribes it carried, decoded, in order. */
  subscribes(): WSMessage[] {
    return this.sent
      .map((frame) => JSON.parse(frame) as WSMessage)
      .filter((frame) => frame.type === "subscribe");
  }
}

const socket = () => StandInSocket.opened.at(-1) as StandInSocket;
const connect = () =>
  createWSConnection({
    url: "ws://test/ws",
    socketFactory: () => new StandInSocket(),
    backoff: { initialMs: 50, jitter: false },
  });

function subscriber() {
  return {
    data: vi.fn<(payload: unknown) => void>(),
    end: vi.fn<(error: RealtimeError | undefined) => void>(),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  StandInSocket.opened = [];
});

afterEach(() => {
  vi.useRealTimers();
});

describe("a subscription made again to a topic on one connection", () => {
  it("is not ended by the end of the subscribe made before it", () => {
    const conn = connect();
    socket().admit();
    const topic = "api.live.feed";
    const leave = conn.subscribe(topic, subscriber());
    const [first] = socket().subscribes();
    socket().receive({ type: "subscribed", id: first?.id, topic, seq: 0, epoch: "e1" });

    leave();
    const again = subscriber();
    conn.subscribe(topic, again);
    const second = socket().subscribes().at(-1);
    socket().receive({
      type: "complete",
      id: first?.id,
      topic,
      error: { code: 4403, message: "Not a member" },
    });
    socket().receive({ type: "subscribed", id: second?.id, topic, seq: 0, epoch: "e1" });
    socket().receive({ type: "data", topic, payload: "live" });

    expect(again.end).not.toHaveBeenCalled();
    expect(again.data).toHaveBeenCalledWith("live");
    conn.close();
  });

  it("ends when the server ends the subscribe it made last", () => {
    const conn = connect();
    socket().admit();
    const topic = "api.live.feed";
    const held = subscriber();
    conn.subscribe(topic, held);
    const [made] = socket().subscribes();
    socket().receive({ type: "subscribed", id: made?.id, topic, seq: 0, epoch: "e1" });

    socket().receive({ type: "complete", id: made?.id, topic });

    expect(held.end).toHaveBeenCalledWith(undefined);
    conn.close();
  });
});

describe("two subscriptions the server took for one", () => {
  it("are made again after a reconnect with the newer one's variables", () => {
    const conn = connect();
    socket().admit();
    const served = 'api.chat.room#{"room":"a"}';
    const asked = [
      { topic: 'api.chat.room#{"nick":"ada","room":"a"}', variables: { nick: "ada", room: "a" } },
      { topic: 'api.chat.room#{"nick":"bob","room":"a"}', variables: { nick: "bob", room: "a" } },
    ];
    for (const { topic, variables } of asked) {
      conn.subscribe(topic, subscriber(), variables);
      const made = socket().subscribes().at(-1);
      socket().receive({ type: "renamed", id: made?.id, topic, payload: served });
      socket().receive({ type: "subscribed", id: made?.id, topic: served, seq: 0, epoch: "e1" });
    }

    socket().drop();
    vi.advanceTimersByTime(50);
    socket().admit();

    expect(socket().subscribes()).toEqual([
      expect.objectContaining({ topic: served, payload: { nick: "bob", room: "a" } }),
    ]);
    conn.close();
  });
});
