/**
 * Reading a stream endpoint's events so that closing the stream is never held
 * up by the endpoint.
 *
 * `return()` on a generator parked on an await is queued behind the pending
 * step, so the read never waits for it. A failure the abandoned step ends in
 * later is logged; the abort that closed the stream is not a failure.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { abortableEvents } from "../src/utils/abortable-events";

const settle = () => new Promise((resolve) => setTimeout(resolve, 5));

afterEach(() => vi.restoreAllMocks());

async function readAll<TEvent>(events: AsyncIterable<TEvent>): Promise<TEvent[]> {
  const out: TEvent[] = [];
  for await (const event of events) out.push(event);
  return out;
}

describe("abortableEvents", () => {
  it("yields every event and ends when the source finishes", async () => {
    const source = (async function* () {
      yield 1;
      yield 2;
    })();

    const events = await readAll(abortableEvents(source, new AbortController().signal));

    expect(events).toEqual([1, 2]);
  });

  it("ends a read waiting on a source parked on an await the moment the signal fires", async () => {
    const controller = new AbortController();
    const source = (async function* () {
      yield "first";
      await new Promise(() => {});
    })();
    const reading = readAll(abortableEvents(source, controller.signal));
    await settle();

    controller.abort();

    await expect(reading).resolves.toEqual(["first"]);
  });

  it("asks a source that sits at a yield to return at once", async () => {
    const controller = new AbortController();
    let released = false;
    const source = (async function* () {
      try {
        yield "first";
        yield "second";
      } finally {
        released = true;
      }
    })();
    const iterator = abortableEvents(source, controller.signal);
    await iterator.next();

    controller.abort();
    await settle();

    expect(released).toBe(true);
    await expect(iterator.next()).resolves.toEqual({ done: true, value: undefined });
  });

  it("lets a parked source that watches the signal release what it holds", async () => {
    const controller = new AbortController();
    let released = false;
    const source = (async function* (signal: AbortSignal) {
      try {
        yield "first";
        await new Promise((resolve) => signal.addEventListener("abort", resolve));
        yield "never read";
      } finally {
        released = true;
      }
    })(controller.signal);
    const reading = readAll(abortableEvents(source, controller.signal));
    await settle();

    controller.abort();
    await reading;
    await settle();

    expect(released).toBe(true);
  });

  it("waits for the source's cleanup when the reader stops on its own", async () => {
    const order: string[] = [];
    const source = (async function* () {
      try {
        yield 1;
        yield 2;
      } finally {
        await settle();
        order.push("source released");
      }
    })();

    for await (const _event of abortableEvents(source, new AbortController().signal)) break;
    order.push("reader done");

    expect(order).toEqual(["source released", "reader done"]);
  });

  it("never starts the source when the signal has already fired", async () => {
    let started = false;
    const source = (async function* () {
      started = true;
      yield 1;
    })();

    const events = await readAll(abortableEvents(source, AbortSignal.abort()));

    expect(events).toEqual([]);
    expect(started).toBe(false);
  });

  it("passes on a failure of the source to the reader", async () => {
    const source = (async function* () {
      yield 1;
      throw new Error("upstream gone");
    })();

    await expect(readAll(abortableEvents(source, new AbortController().signal))).rejects.toThrow(
      "upstream gone",
    );
  });

  it("does not leave a failure of an abandoned step unhandled", async () => {
    const controller = new AbortController();
    let fail: (error: Error) => void = () => {};
    const source = (async function* () {
      yield 1;
      await new Promise((_resolve, reject) => {
        fail = reject;
      });
    })();
    const reading = readAll(abortableEvents(source, controller.signal));
    await settle();

    controller.abort();
    await reading;
    fail(new Error("failed after the stream closed"));
    await settle();

    await expect(reading).resolves.toEqual([1]);
  });

  it("warns of a failure of an abandoned step, with the error", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const controller = new AbortController();
    let fail: (error: Error) => void = () => {};
    const source = (async function* () {
      yield 1;
      await new Promise((_resolve, reject) => {
        fail = reject;
      });
    })();
    const reading = readAll(abortableEvents(source, controller.signal));
    await settle();
    const failure = new Error("failed after the stream closed");

    controller.abort();
    await reading;
    fail(failure);
    await settle();

    const line = warn.mock.calls.find((call) => String(call[1]).includes("Stream generator failed"));
    expect(line?.at(-1)).toBe(failure);
  });

  it("does not report the abort that closed the stream as a failure", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const controller = new AbortController();
    const source = (async function* (signal: AbortSignal) {
      yield 1;
      await new Promise((_resolve, reject) =>
        signal.addEventListener("abort", () => reject(signal.reason), { once: true }),
      );
    })(controller.signal);
    const reading = readAll(abortableEvents(source, controller.signal));
    await settle();

    controller.abort();
    await reading;
    await settle();

    expect(warn.mock.calls.some((call) => String(call[1]).includes("Stream generator"))).toBe(false);
  });
});
