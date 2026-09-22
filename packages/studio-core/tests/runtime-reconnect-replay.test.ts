import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A stand-in for the socket.io client that lets a test open the connection,
 * drop it, and open it again — the sequence a Studio restart puts every
 * running application through.
 */
class FakeSocket {
  connected = false;
  readonly emitted: Array<{ event: string; payload: unknown }> = [];
  private readonly handlers = new Map<string, Array<(arg: unknown) => void>>();

  on(event: string, fn: (arg: unknown) => void): this {
    const list = this.handlers.get(event) ?? [];
    list.push(fn);
    this.handlers.set(event, list);
    return this;
  }

  emit(event: string, payload: unknown): this {
    this.emitted.push({ event, payload });
    return this;
  }

  removeAllListeners(): this {
    this.handlers.clear();
    return this;
  }

  disconnect(): this {
    this.connected = false;
    return this;
  }

  /** Drive a connect the way the real client does once the transport is up. */
  fireConnect(): void {
    this.connected = true;
    for (const fn of this.handlers.get("connect") ?? []) fn(undefined);
  }

  fireDisconnect(): void {
    this.connected = false;
    for (const fn of this.handlers.get("disconnect") ?? []) fn(undefined);
  }

  announcements(): unknown[] {
    return this.emitted.filter((e) => e.event === "runtime:announce").map((e) => e.payload);
  }

  countOf(event: string): number {
    return this.emitted.filter((e) => e.event === event).length;
  }
}

let socket: FakeSocket;

vi.mock("socket.io-client", () => ({
  io: () => socket,
}));

const { connectRuntimeSocket } = await import("../src/runtime/connect-runtime-socket");

function makeHandle() {
  return {
    setDisposer: () => {},
    setAnnouncer: () => {},
  };
}

const HTTP_CLAIM = {
  transports: ["http"] as const,
  sources: [],
  listenOrigin: "http://localhost:3000",
};

beforeEach(() => {
  socket = new FakeSocket();
});

describe("runtime socket across a Studio restart", () => {
  it("states its claims again on the second connect", async () => {
    const pending = [{ ...HTTP_CLAIM }];
    await connectRuntimeSocket(
      { runtimeId: "app", kind: "server", studioUrl: "http://localhost:6280" },
      pending as never,
      makeHandle(),
    );

    socket.fireConnect();
    expect(socket.announcements()).toHaveLength(1);

    // Studio goes away and comes back; the client reconnects on its own.
    socket.fireDisconnect();
    socket.fireConnect();

    /* Studio releases a runtime's claims when its socket drops, so a runtime
       that only said hello would come back bound to nothing. */
    expect(socket.countOf("runtime:hello")).toBe(2);
    expect(socket.announcements()).toHaveLength(2);
    expect(socket.announcements()[1]).toEqual(socket.announcements()[0]);
  });

  it("announces nothing twice on a first connect", async () => {
    const pending = [{ ...HTTP_CLAIM }, { ...HTTP_CLAIM, transports: ["sse"] as const }];
    await connectRuntimeSocket(
      { runtimeId: "app", kind: "server", studioUrl: "http://localhost:6280" },
      pending as never,
      makeHandle(),
    );

    socket.fireConnect();

    expect(socket.announcements()).toHaveLength(2);
  });

  it("replays claims that were announced after the first connect", async () => {
    const pending: unknown[] = [];
    let announcer: () => void = () => {};
    await connectRuntimeSocket(
      { runtimeId: "app", kind: "server", studioUrl: "http://localhost:6280" },
      pending as never,
      { setDisposer: () => {}, setAnnouncer: (fn: () => void) => (announcer = fn) },
    );

    socket.fireConnect();
    expect(socket.announcements()).toHaveLength(0);

    // An adapter wires its route after the socket was already open.
    pending.push({ ...HTTP_CLAIM });
    announcer();
    expect(socket.announcements()).toHaveLength(1);

    socket.fireDisconnect();
    socket.fireConnect();

    expect(socket.announcements()).toHaveLength(2);
  });
});
