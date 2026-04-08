import { describe, expect, it } from "vitest";

import { deriveSSE } from "../src/realtime/derive-sse";
import type { SSEContext, SSEEvent, SSEHandler } from "../src/realtime/types";

function createMockCtx<T = undefined>(overrides?: Partial<SSEContext<T>>): SSEContext<T> {
  return {
    variables: undefined as T,
    signal: new AbortController().signal,
    headers: new Headers(),
    ...overrides,
  };
}

describe("deriveSSE", () => {
  it("transforms events from source stream", async () => {
    const source: SSEHandler<number> = async function* () {
      yield { data: 1 };
      yield { data: 2 };
      yield { data: 3 };
    };

    const doubled = deriveSSE(source, async function* (events) {
      for await (const event of events) {
        yield { data: event.data * 2 };
      }
    });

    const ctx = createMockCtx();
    const results: SSEEvent<number>[] = [];
    for await (const event of doubled(ctx)) {
      results.push(event);
    }

    expect(results).toEqual([{ data: 2 }, { data: 4 }, { data: 6 }]);
  });

  it("filters events", async () => {
    const source: SSEHandler<number> = async function* () {
      yield { data: 1 };
      yield { data: 2 };
      yield { data: 3 };
      yield { data: 4 };
      yield { data: 5 };
    };

    const evens = deriveSSE(source, async function* (events) {
      for await (const event of events) {
        if (event.data % 2 === 0) yield event;
      }
    });

    const ctx = createMockCtx();
    const results: number[] = [];
    for await (const event of evens(ctx)) {
      results.push(event.data);
    }

    expect(results).toEqual([2, 4]);
  });

  it("batches events", async () => {
    const source: SSEHandler<number> = async function* () {
      yield { data: 1 };
      yield { data: 2 };
      yield { data: 3 };
      yield { data: 4 };
      yield { data: 5 };
    };

    const batched = deriveSSE(source, async function* (events) {
      let buffer: number[] = [];
      for await (const event of events) {
        buffer.push(event.data);
        if (buffer.length >= 2) {
          yield { data: buffer };
          buffer = [];
        }
      }
      if (buffer.length > 0) yield { data: buffer };
    });

    const ctx = createMockCtx();
    const results: number[][] = [];
    for await (const event of batched(ctx)) {
      results.push(event.data);
    }

    expect(results).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("passes context to transform", async () => {
    const source: SSEHandler<string, { prefix: string }> = async function* (ctx) {
      yield { data: `${ctx.variables.prefix}-1` };
    };

    const enriched = deriveSSE<string, string, { prefix: string }>(
      source,
      async function* (events, ctx) {
        for await (const event of events) {
          yield { data: `${event.data}-enriched-${ctx.variables.prefix}` };
        }
      },
    );

    const ctx = createMockCtx({ variables: { prefix: "test" } });
    const results: string[] = [];
    for await (const event of enriched(ctx as SSEContext<{ prefix: string }>)) {
      results.push(event.data);
    }

    expect(results).toEqual(["test-1-enriched-test"]);
  });

  it("cleans up source generator when derived ends early", async () => {
    let sourceCleanedUp = false;
    const source: SSEHandler<number> = async function* () {
      try {
        yield { data: 1 };
        yield { data: 2 };
        yield { data: 3 };
      } finally {
        sourceCleanedUp = true;
      }
    };

    const takeOne = deriveSSE(source, async function* (events) {
      for await (const event of events) {
        yield event;
        return; // Stop after first event
      }
    });

    const ctx = createMockCtx();
    const results: number[] = [];
    for await (const event of takeOne(ctx)) {
      results.push(event.data);
    }

    expect(results).toEqual([1]);
    expect(sourceCleanedUp).toBe(true);
  });

  it("preserves event metadata (id, event, retry)", async () => {
    const source: SSEHandler<string> = async function* () {
      yield { data: "msg", id: "42", event: "update", retry: 1000 };
    };

    const passthrough = deriveSSE(source, async function* (events) {
      for await (const event of events) {
        yield event;
      }
    });

    const ctx = createMockCtx();
    const results: SSEEvent<string>[] = [];
    for await (const event of passthrough(ctx)) {
      results.push(event);
    }

    expect(results[0]).toEqual({ data: "msg", id: "42", event: "update", retry: 1000 });
  });
});
