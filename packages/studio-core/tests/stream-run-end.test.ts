/**
 * How a Playground stream's run ends: a stream that completes, or is
 * cancelled, ends with `playground:end`; one that fails ends with its error
 * alone. Studio settles a run on its first end, so an error sent after one
 * never reached the Playground.
 */
import { describe, expect, it } from "vitest";

import type { PlaygroundExecutePayload } from "../src/runtime/playground-payloads";
import type { ResponderSocket } from "../src/runtime/playground-responder";
import { dispatchSSE, type StreamOpener } from "../src/runtime/responder-dispatch";

const payload: PlaygroundExecutePayload = {
  rid: "r1",
  source: "api",
  group: "live",
  method: "feed",
  transport: "sse",
  mode: "proxy",
};

function recorder(): { socket: ResponderSocket; emitted: string[] } {
  const emitted: string[] = [];
  return { socket: { on: () => {}, emit: (event) => emitted.push(event) }, emitted };
}

function opener(events: unknown[], failure?: Error): StreamOpener {
  return async () => ({
    async *[Symbol.asyncIterator]() {
      for (const event of events) yield event;
      if (failure) throw failure;
    },
  });
}

describe("a Playground stream's run", () => {
  it("ends with playground:end when the stream completes", async () => {
    const { socket, emitted } = recorder();

    await dispatchSSE(socket, payload, {}, new AbortController().signal, opener([{ n: 1 }]));

    expect(emitted).toEqual(["playground:chunk", "playground:end"]);
  });

  it("sends no end when the stream fails, leaving its error to end it", async () => {
    const { socket, emitted } = recorder();
    const failure = new Error("refused");

    await expect(
      dispatchSSE(socket, payload, {}, new AbortController().signal, opener([{ n: 1 }], failure)),
    ).rejects.toBe(failure);
    expect(emitted).toEqual(["playground:chunk"]);
  });
});
