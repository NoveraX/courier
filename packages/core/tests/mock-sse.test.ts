/**
 * The in-memory subscription `createMockSSESubscription` builds for tests,
 * held to how a real one ends.
 */
import { describe, expect, it } from "vitest";

import { ForbiddenError, RealtimeError } from "../src/realtime/errors";
import { createMockSSESubscription } from "../src/testing/mock-sse";

async function readAll<TData>(sub: AsyncIterable<{ data: TData }>): Promise<TData[]> {
  const seen: TData[] = [];
  for await (const event of sub) seen.push(event.data);
  return seen;
}

describe("createMockSSESubscription", () => {
  it("ends when the generator returns", async () => {
    const sub = createMockSSESubscription(async function* () {
      yield { data: 1 };
      yield { data: 2 };
    });

    await expect(readAll(sub)).resolves.toEqual([1, 2]);
    expect(sub.status).toBe("disconnected");
  });

  it("rejects with the generator's RealtimeError, after what came before", async () => {
    const seen: string[] = [];
    const sub = createMockSSESubscription<string>(async function* () {
      yield { data: "before" };
      throw new ForbiddenError("Not a member of this room");
    });

    const reading = (async () => {
      for await (const event of sub) seen.push(event.data);
    })();

    await expect(reading).rejects.toThrow(ForbiddenError);
    expect(seen).toEqual(["before"]);
  });

  it("rejects with code 5000 for any other error, as a real client reads it", async () => {
    const sub = createMockSSESubscription(async function* () {
      throw new Error("connect ECONNREFUSED 10.0.0.5:5432");
    });

    const failure = await readAll(sub).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(RealtimeError);
    expect(failure).toMatchObject({ code: 5000, message: "Stream failed" });
  });

  it("closes when the reader leaves the loop early", async () => {
    let released = false;
    const sub = createMockSSESubscription(async function* () {
      try {
        yield { data: 1 };
        yield { data: 2 };
      } finally {
        released = true;
      }
    });

    for await (const _event of sub) break;
    await new Promise((resolve) => setTimeout(resolve, 5));

    expect(released).toBe(true);
    expect(sub.status).toBe("disconnected");
  });
});
