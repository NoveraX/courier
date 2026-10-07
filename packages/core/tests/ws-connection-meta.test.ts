import { afterEach, describe, expect, it, vi } from "vitest";

import { createWSHandler } from "../src/adapter/handle-ws";
import type { WSSocketContext } from "../src/adapter/ws-context";
import { handleReauth } from "../src/adapter/ws-reauth";
import { createWSConnection } from "../src/realtime/ws/ws-connection";
import type { WSMessage } from "../src/realtime/ws/ws-protocol";
import type { WSConnection } from "../src/realtime/ws/ws-types";
import { type ServedWS, serveWS, settle, stopWS } from "./helpers/ws-server";

/**
 * The metadata a WebSocket connection carries is what the handler's
 * `onConnect` returned, and every other hook is typed from that return. An
 * `onConnect` or `onReauth` that hands back anything but an object, or
 * nothing, breaks that promise, and is refused as a throw from it is.
 */
describe("the metadata the WebSocket hooks receive", () => {
  it("is typed from what onConnect returns", async () => {
    const handler = createWSHandler({
      onConnect: async () => ({ userId: "u1", roles: ["admin"] }),
      onDisconnect: ({ meta }) => {
        const userId: string = meta.userId;
        expect(userId).toBeTypeOf("string");
      },
      authorize: ({ meta }) => meta.roles.includes("admin"),
      onReauth: ({ meta, auth }) => ({
        userId: `${meta.userId}:${String(auth?.token)}`,
        roles: [],
      }),
    });

    expect(handler.connections.count).toBe(0);
    await handler.destroy();
  });

  it("has no fields where onConnect returns nothing", async () => {
    const handler = createWSHandler({
      onConnect: ({ request }) => {
        if (!request.headers.has("authorization")) throw new Error("Unauthorized");
      },
      onDisconnect: ({ meta }) => {
        const absent: undefined = meta.userId;
        expect(absent).toBeUndefined();
      },
    });

    expect(handler.connections.count).toBe(0);
    await handler.destroy();
  });

  it("is a record of unknown fields where there is no onConnect", async () => {
    const handler = createWSHandler({
      onReauth: ({ auth }) => ({ role: auth?.token === "admin-token" ? "admin" : "user" }),
      authorizeMessage: ({ meta }) => meta.role === "admin",
    });

    expect(handler.connections.count).toBe(0);
    await handler.destroy();
  });

  it("is an object, or nothing, where onConnect is typed", async () => {
    // @ts-expect-error — onConnect returns the connection's metadata, an object
    const handler = createWSHandler({ onConnect: () => "user-1" });

    expect(handler.connections.count).toBe(0);
    await handler.destroy();
  });
});

describe("a connection whose onConnect returns something other than an object", () => {
  let served: ServedWS | undefined;
  let client: WSConnection | undefined;

  afterEach(async () => {
    client?.close();
    client = undefined;
    await stopWS(served);
    served = undefined;
    vi.restoreAllMocks();
  });

  it("is refused, and why is logged", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    served = await serveWS(
      {},
      {
        // @ts-expect-error — a JavaScript application may return anything
        onConnect: () => "user-1",
      },
    );

    client = createWSConnection({ url: served.url });
    await settle(300);

    expect(served.handler.connections.count).toBe(0);
    const causes = warn.mock.calls.map((call) => String(call[2]));
    expect(causes.some((cause) => cause.includes("onConnect returned a string"))).toBe(true);
  });
});

describe("credentials sent again whose onReauth returns something other than an object", () => {
  it("is refused, and leaves the metadata as it was", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const sent: WSMessage[] = [];
    const registry = { updateMeta: vi.fn(), getEntry: vi.fn(() => undefined) };
    const ctx = {
      connectionId: "conn-1",
      meta: { userId: "user-1" },
      handshake: new Request("http://app.example.com/api/ws"),
      sendMessage: (message: WSMessage) => sent.push(message),
      onReauth: async () => "user-2",
      registry,
    } as unknown as WSSocketContext;

    await handleReauth(ctx, { type: "auth", id: "1", payload: { auth: { token: "fresh" } } });

    expect(ctx.meta).toEqual({ userId: "user-1" });
    expect(registry.updateMeta).not.toHaveBeenCalled();
    expect(sent).toEqual([
      { type: "error", id: "1", error: { code: 4401, message: "Credentials rejected" } },
    ]);
    expect(String(warn.mock.calls[0]?.[2])).toContain("onReauth returned a string");
    warn.mockRestore();
  });
});
