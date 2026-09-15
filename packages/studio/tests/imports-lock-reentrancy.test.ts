import { describe, expect, it } from "vitest";
import { withImportsLock } from "../src/server/imports-lock";

describe("withImportsLock", () => {
  it("serializes concurrent top-level tasks", async () => {
    const order: string[] = [];
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

    const a = withImportsLock(async () => {
      order.push("a:start");
      await wait(20);
      order.push("a:end");
    });
    const b = withImportsLock(async () => {
      order.push("b:start");
      await wait(5);
      order.push("b:end");
    });

    await Promise.all([a, b]);
    expect(order).toEqual(["a:start", "a:end", "b:start", "b:end"]);
  });

  it("allows reentrant calls from inside the lock without deadlocking", async () => {
    const order: string[] = [];

    await withImportsLock(async () => {
      order.push("outer:start");
      const inner = await withImportsLock(() => {
        order.push("inner");
        return 42;
      });
      expect(inner).toBe(42);
      order.push("outer:end");
    });

    expect(order).toEqual(["outer:start", "inner", "outer:end"]);
  });

  it("propagates return values and errors from top-level tasks", async () => {
    await expect(withImportsLock(() => "ok")).resolves.toBe("ok");
    await expect(withImportsLock(() => Promise.reject(new Error("boom")))).rejects.toThrow(
      "boom",
    );

    /* Queue must survive a rejection. */
    await expect(withImportsLock(() => "after")).resolves.toBe("after");
  });

  it("propagates errors from reentrant inner calls", async () => {
    await expect(
      withImportsLock(async () => {
        await withImportsLock(() => {
          throw new Error("inner-fail");
        });
      }),
    ).rejects.toThrow("inner-fail");
  });
});
