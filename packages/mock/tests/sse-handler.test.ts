/**
 * How the mock server ends an SSE stream.
 *
 * A mock stream ended with no word on how, so a Courier client reconnected
 * and replayed it forever; a generator that threw rejected with nobody
 * listening; and a string payload went out raw, which the client dropped.
 */
import { ForbiddenError, SSE_CONTROL_EVENTS } from "@noverax/courier/realtime";
import type { Context as HonoContext } from "hono";
import { describe, expect, it, vi } from "vitest";

import { handleSSEMock } from "../src/server/sse-handler";
import type { MockRequestContext, ResolvedHandler } from "../src/types";

const CTX: MockRequestContext = {
  variables: {},
  headers: new Headers(),
  callIndex: 0,
  scenarioState: "Started",
};

function honoContext(signal = new AbortController().signal): HonoContext {
  return {
    req: { raw: new Request("http://mock.local/feed", { signal }) },
    json: (body: unknown, status: number) => Response.json(body, { status }),
  } as unknown as HonoContext;
}

function handlerFor(streamFn: NonNullable<ResolvedHandler["streamFn"]>): ResolvedHandler {
  return { fn: () => undefined, status: 200, isError: false, streamFn };
}

describe("handleSSEMock", () => {
  it("ends a finished stream with the completion event", async () => {
    const response = handleSSEMock(
      honoContext(),
      handlerFor(async function* () {
        yield { data: "hello" };
      }),
      CTX,
      () => undefined,
    );

    const text = await response.text();

    expect(text).toBe(`data: "hello"\n\nevent: ${SSE_CONTROL_EVENTS.complete}\ndata: null\n\n`);
  });

  it("ends a failed stream with the failure event, a RealtimeError's text kept", async () => {
    const response = handleSSEMock(
      honoContext(),
      handlerFor(async function* () {
        throw new ForbiddenError("Not a member of this room");
      }),
      CTX,
      () => undefined,
    );

    const text = await response.text();

    expect(text).toBe(
      `event: ${SSE_CONTROL_EVENTS.error}\ndata: {"code":4403,"message":"Not a member of this room"}\n\n`,
    );
  });

  it("logs a failed stream with the error itself", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const refused = new Error("connect ECONNREFUSED 10.0.0.5:5432");
    const response = handleSSEMock(
      honoContext(),
      handlerFor(async function* () {
        throw refused;
      }),
      CTX,
      () => undefined,
    );

    await response.text();

    const line = warn.mock.calls.find((call) => String(call[1]).includes("Stream handler failed"));
    expect(line?.at(-1)).toBe(refused);
    warn.mockRestore();
  });

  it("keeps any other error's text off the wire", async () => {
    const response = handleSSEMock(
      honoContext(),
      handlerFor(async function* () {
        throw new Error("connect ECONNREFUSED 10.0.0.5:5432");
      }),
      CTX,
      () => undefined,
    );

    const text = await response.text();

    expect(text).toContain('{"code":5000,"message":"Stream failed"}');
    expect(text).not.toContain("ECONNREFUSED");
  });

  it("keeps event fields on one line", async () => {
    const response = handleSSEMock(
      honoContext(),
      handlerFor(async function* () {
        yield { id: "1\ndata: forged", event: "tick\r\n", data: { n: 1 } };
      }),
      CTX,
      () => undefined,
    );

    const text = await response.text();

    expect(text.startsWith('id: 1data: forged\nevent: tick\ndata: {"n":1}\n\n')).toBe(true);
  });

  it("reports how the stream ended once it has", async () => {
    const onEnded = vi.fn();
    const finished = handleSSEMock(
      honoContext(),
      handlerFor(async function* () {
        yield { data: 1 };
        yield { data: 2 };
      }),
      CTX,
      onEnded,
    );
    await finished.text();
    await vi.waitFor(() => expect(onEnded).toHaveBeenCalledWith({ events: 2 }));

    const failing = vi.fn();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const failed = handleSSEMock(
      honoContext(),
      handlerFor(async function* () {
        yield { data: 1 };
        throw new Error("feed dropped");
      }),
      CTX,
      failing,
    );
    await failed.text();
    await vi.waitFor(() => expect(failing).toHaveBeenCalledWith({ events: 1, error: "feed dropped" }));
    warn.mockRestore();
  });
});
