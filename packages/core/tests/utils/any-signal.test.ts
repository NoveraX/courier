/**
 * Combining abort signals where the platform has no `AbortSignal.any`, as
 * in the Next.js Edge runtime, and where it has one.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { anySignal } from "../../src/utils/any-signal";

afterEach(() => {
  vi.unstubAllGlobals();
});

/** The platform's AbortSignal, without `any`. */
function withoutAny(): void {
  const { any: _dropped, ...rest } = Object.getOwnPropertyDescriptors(AbortSignal);
  const Edge = Object.defineProperties(function EdgeAbortSignal() {}, rest);
  vi.stubGlobal("AbortSignal", Edge);
}

describe.each([
  ["without AbortSignal.any", withoutAny],
  ["with AbortSignal.any", () => undefined],
])("anySignal %s", (_name, setUp) => {
  it("aborts, with its reason, when any one of its signals aborts", () => {
    setUp();
    const first = new AbortController();
    const second = new AbortController();
    const signal = anySignal([first.signal, second.signal]);

    second.abort("second");

    expect(signal.aborted).toBe(true);
    expect(signal.reason).toBe("second");
  });

  it("starts aborted when one of its signals already is", () => {
    setUp();
    const done = new AbortController();
    done.abort("done");

    const signal = anySignal([new AbortController().signal, done.signal]);

    expect(signal.aborted).toBe(true);
    expect(signal.reason).toBe("done");
  });

  it("stays open while none of its signals aborts", () => {
    setUp();

    const signal = anySignal([new AbortController().signal, new AbortController().signal]);

    expect(signal.aborted).toBe(false);
  });
});

describe("anySignal without AbortSignal.any", () => {
  it("stops listening to its signals once it has aborted", () => {
    withoutAny();
    const first = new AbortController();
    const second = new AbortController();
    const removed = vi.spyOn(second.signal, "removeEventListener");

    anySignal([first.signal, second.signal]);
    first.abort();

    expect(removed).toHaveBeenCalledWith("abort", expect.any(Function));
  });
});
