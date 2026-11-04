/**
 * What a WebSocket connection reports, and lets an application do, as a
 * real server admits it, refuses it and asks again for its credentials.
 *
 * A connection is connected once the server has admitted it, not as soon as
 * its socket opens, and a refused one never reads connected. Credentials the
 * server refuses with 4401 are asked for anew once, and sent only when they
 * changed; a connection whose credentials stay refused ends with the
 * server's reason, and `reconnect()` signs it in again — one attempt
 * however often it is called.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthError } from "../src/realtime/errors";
import type { ConnectionStatus } from "../src/realtime/types";
import { createWSConnection } from "../src/realtime/ws/ws-connection";
import type { WSConnection, WSConnectionConfig } from "../src/realtime/ws/ws-types";
import { type ServedWS, serveWS, stopWS } from "./helpers/ws-server";

let served: ServedWS | undefined;
const opened: WSConnection[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  for (const connection of opened.splice(0)) connection.close();
  await stopWS(served);
  served = undefined;
});

function connect(config: Omit<WSConnectionConfig, "url">): WSConnection {
  if (!served) throw new Error("no server is running");
  const connection = createWSConnection({ url: served.url, ...config });
  opened.push(connection);
  return connection;
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve = (): void => undefined;
  const promise = new Promise<void>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

const quiet = () => vi.spyOn(console, "warn").mockImplementation(() => undefined);

describe("a connection's status", () => {
  it("is connecting until the server has admitted the connection", async () => {
    const asked = deferred();
    const admit = deferred();
    served = await serveWS(
      {},
      {
        onConnect: async () => {
          asked.resolve();
          await admit.promise;
          return { userId: "u1" };
        },
      },
    );
    const conn = connect({ credentials: () => ({ frame: { auth: { token: "t1" } } }) });

    await asked.promise;
    expect(conn.status).toBe("connecting");
    expect(conn.state.phase).toBe("authenticating");

    admit.resolve();
    await vi.waitFor(() => expect(conn.status).toBe("connected"));
  });

  it("never reads connected for a connection the server refused", async () => {
    quiet();
    served = await serveWS(
      {},
      {
        onConnect: () => {
          throw new Error("not today");
        },
      },
    );
    const heard: ConnectionStatus[] = [];
    const conn = connect({ onStatusChange: (status) => heard.push(status) });

    await vi.waitFor(() => expect(conn.status).toBe("disconnected"));
    expect(heard).toEqual(["connecting", "disconnected"]);
  });
});

describe("credentials the server refuses with 4401", () => {
  async function refusingAllBut(fresh: string): Promise<unknown[]> {
    const tokens: unknown[] = [];
    served = await serveWS(
      {},
      {
        onConnect: ({ auth }) => {
          tokens.push(auth?.token);
          if (auth?.token !== fresh) throw new Error("expired");
          return { userId: "u1" };
        },
      },
    );
    return tokens;
  }

  it("are asked for anew at once, and the connection signs in with the new ones", async () => {
    quiet();
    const tokens = await refusingAllBut("fresh");
    const issued = ["stale", "fresh"];
    const conn = connect({
      credentials: () => ({ frame: { auth: { token: issued.shift() ?? "none" } } }),
    });

    await vi.waitFor(() => expect(conn.status).toBe("connected"));
    expect(tokens).toEqual(["stale", "fresh"]);
  });

  it("end the connection with the server's reason when the ones asked for anew are the same", async () => {
    quiet();
    const tokens = await refusingAllBut("fresh");
    const conn = connect({ credentials: () => ({ frame: { auth: { token: "stale" } } }) });

    await vi.waitFor(() => expect(conn.state.phase).toBe("failed"));
    const { state } = conn;
    expect(state.phase === "failed" && state.error).toBeInstanceOf(AuthError);
    expect(state.phase === "failed" && state.error.message).toBe("Connection rejected");
    expect(tokens).toEqual(["stale"]);
  });

  it("can be signed in again with reconnect(), which asks for them anew", async () => {
    quiet();
    const tokens = await refusingAllBut("fresh");
    let token = "stale";
    const conn = connect({ credentials: () => ({ frame: { auth: { token } } }) });
    await vi.waitFor(() => expect(conn.state.phase).toBe("failed"));

    token = "fresh";
    conn.reconnect();

    await vi.waitFor(() => expect(conn.status).toBe("connected"));
    expect(tokens).toEqual(["stale", "fresh"]);
  });
});

describe("reconnect()", () => {
  it("opens one new socket however many times it is called at once", async () => {
    let connections = 0;
    served = await serveWS(
      {},
      {
        onConnect: () => {
          connections += 1;
          return {};
        },
      },
    );
    const conn = connect({ credentials: () => ({ frame: {} }) });
    await vi.waitFor(() => expect(conn.status).toBe("connected"));

    for (let i = 0; i < 100; i++) conn.reconnect();

    await vi.waitFor(() => expect(conn.status).toBe("connected"));
    expect(connections).toBe(2);
    expect(served.handler.connections.list()).toHaveLength(1);
  });

  it("does nothing on a connection that was closed", async () => {
    const warn = quiet();
    served = await serveWS({});
    const conn = connect({});
    conn.close();

    conn.reconnect();

    expect(conn.state).toEqual({ phase: "closed", by: "client" });
    expect(warn.mock.calls.join(" ")).toContain(
      "reconnect() does nothing on a connection that was closed",
    );
  });
});

describe("credentials refused when the server asked for them again", () => {
  it("end the connection at once, with the server's reason, well before its deadline", async () => {
    quiet();
    served = await serveWS(
      {},
      {
        onConnect: () => ({ userId: "u1" }),
        onReauth: () => {
          throw new Error("revoked");
        },
      },
    );
    const conn = connect({ credentials: () => ({ frame: { auth: { token: "t1" } } }) });
    await vi.waitFor(() => expect(conn.status).toBe("connected"));
    const [connection] = served.handler.connections.list();
    if (!connection) throw new Error("no connection was opened");

    void served.handler.connections.requireAuth(connection.connectionId, { timeoutMs: 30_000 });

    await vi.waitFor(() => expect(conn.state.phase).toBe("failed"), { timeout: 5_000 });
    const { state } = conn;
    expect(state.phase === "failed" && state.error.message).toBe("Credentials rejected");
  });
});
