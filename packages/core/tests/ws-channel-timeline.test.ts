/**
 * What Studio's Timeline records for a channel that ends, against a real
 * server: a join the server refuses and a connection it refuses were both
 * recorded as complete, like a channel the server closed without a reason.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { courier } from "../src/define/courier";
import { ForbiddenError } from "../src/realtime/errors";
import { executeWSChannel } from "../src/realtime/ws-channel-client";
import { studioHooks } from "../src/studio";
import type { StudioHooks } from "../src/studio/hooks";
import { instrumentWSChannel } from "../src/transport/instrument";
import { type ServedWS, serveWS, settle, stopWS } from "./helpers/ws-server";

const { channel } = courier();

const META = {
  source: "api",
  group: "live",
  method: "room",
  transport: "ws" as const,
  mode: "direct" as const,
};

let served: ServedWS | undefined;
let originalHooks: StudioHooks;

beforeEach(() => {
  originalHooks = { ...studioHooks };
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(async () => {
  vi.restoreAllMocks();
  for (const key of Object.keys(studioHooks) as Array<keyof StudioHooks>) delete studioHooks[key];
  Object.assign(studioHooks, originalHooks);
  await stopWS(served);
  served = undefined;
});

/* The server runs in this process too and records its side of the channel. */
const CLIENT = "client-side";

function record(): { closes: string[]; errors: string[] } {
  const closes: string[] = [];
  const errors: string[] = [];
  studioHooks.onStreamOpen = () => undefined;
  studioHooks.onStreamClose = (event) => {
    if (event.requestId === CLIENT) closes.push(event.reason);
  };
  studioHooks.onStreamError = (event) => {
    if (event.requestId === CLIENT) errors.push(event.error);
  };
  return { closes, errors };
}

function open(url: string): void {
  instrumentWSChannel(executeWSChannel<string, string>(url, "api.live.room"), META, CLIENT);
}

describe("the Timeline's record of a channel", () => {
  it("is failed, with why, when the server refuses the join", async () => {
    served = await serveWS({
      room: channel
        .send<string>()
        .response<string>()
        .implement(() => ({
          onJoin: () => {
            throw new ForbiddenError("Not a member of this room");
          },
          onMessage() {},
        })),
    });
    const recorded = record();

    open(served.url);
    await settle(300);

    expect(recorded.closes).toEqual(["error"]);
    expect(recorded.errors).toEqual(["Not a member of this room"]);
  });

  it("is failed when the server refuses the connection", async () => {
    served = await serveWS(
      {
        room: channel
          .send<string>()
          .response<string>()
          .implement(() => ({ onMessage() {} })),
      },
      {
        onConnect: () => {
          throw new Error("not today");
        },
      },
    );
    const recorded = record();

    open(served.url);
    await settle(1_500);

    expect(recorded.closes).toEqual(["error"]);
    expect(recorded.errors).toEqual(["Connection rejected"]);
  });

  it("is complete when the server closes the channel without a reason", async () => {
    served = await serveWS({
      room: channel
        .send<string>()
        .response<string>()
        .implement(() => ({
          onJoin: (ctx) => ctx.close(),
          onMessage() {},
        })),
    });
    const recorded = record();

    open(served.url);
    await settle(300);

    expect(recorded.closes).toEqual(["complete"]);
    expect(recorded.errors).toEqual([]);
  });
});
