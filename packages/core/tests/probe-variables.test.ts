import { describe, expect, it } from "vitest";
import { courier } from "../src/define/courier";

/**
 * A closure is probed once at definition time against stand-in variables. It
 * may read, walk, call and interpolate them on the way to the call that
 * addresses the endpoint, so defining an endpoint never depends on what a
 * caller will eventually pass.
 */
describe("probing a closure that reads its variables", () => {
  const { query, mutation } = courier();

  it("survives a method call on a variable", () => {
    const byIds = query
      .variables<{ ids: string[] }>()
      .via((http, vars) => http.get(`items/${vars.ids.join(",")}`));

    expect(byIds.method).toBe("get");
  });

  it("survives walking into a nested variable", () => {
    const nested = query
      .variables<{ page: { size: number } }>()
      .via((http, vars) => http.get(`items?size=${vars.page.size}`));

    expect(nested.method).toBe("get");
  });

  it("survives iterating a variable", () => {
    const many = mutation
      .variables<{ items: string[] }>()
      .via((http, vars) => http.post("items", [...vars.items]));

    expect(many.method).toBe("post");
  });

  it("survives a variable used in arithmetic", () => {
    const paged = query
      .variables<{ page: number }>()
      .via((http, vars) => http.get(`items?offset=${vars.page * 20}`));

    expect(paged.method).toBe("get");
  });

  it("survives a closure that guards against a missing variable", () => {
    const guarded = query
      .variables<{ id?: string }>()
      .via((http, vars) => (vars.id ? http.get(":id", vars) : http.get("")));

    expect(guarded.method).toBe("get");
  });

  it("reports what the closure actually threw rather than blaming the wire", () => {
    expect(() =>
      query.via(() => {
        throw new Error("boom from user code");
      }),
    ).toThrow(/boom from user code/);
  });

  it("still names the missing wire call when the closure simply made none", () => {
    expect(() => query.via((() => undefined) as never)).toThrow(/made no wire call/);
  });
});
