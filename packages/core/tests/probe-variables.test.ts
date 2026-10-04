import { describe, expect, it } from "vitest";
import { courier } from "../src/define/courier";

/**
 * A closure is probed once at definition time against stand-in variables. It
 * may read, walk, call and interpolate them on the way to the call that
 * addresses the endpoint, so defining an endpoint never depends on what a
 * caller will eventually pass.
 */
describe("probing a closure that reads its variables", () => {
  const { endpoint } = courier();

  it("survives a method call on a variable", () => {
    const byIds = endpoint
      .variables<{ ids: string[] }>()
      .via((http, vars) => http.get(`items/${vars.ids.join(",")}`))
      .reads();

    expect(byIds.method).toBe("get");
  });

  it("survives walking into a nested variable", () => {
    const nested = endpoint
      .variables<{ page: { size: number } }>()
      .via((http, vars) => http.get(`items?size=${vars.page.size}`))
      .reads();

    expect(nested.method).toBe("get");
  });

  it("survives iterating a variable", () => {
    const many = endpoint
      .variables<{ items: string[] }>()
      .via((http, vars) => http.post("items", [...vars.items]));

    expect(many.method).toBe("post");
  });

  it("survives a variable used in arithmetic", () => {
    const paged = endpoint
      .variables<{ page: number }>()
      .via((http, vars) => http.get(`items?offset=${vars.page * 20}`))
      .reads();

    expect(paged.method).toBe("get");
  });

  it("survives a closure that guards against a missing variable", () => {
    const guarded = endpoint
      .variables<{ id?: string }>()
      .via((http, vars) => (vars.id ? http.get(":id", vars) : http.get("")))
      .reads();

    expect(guarded.method).toBe("get");
  });

  it("reports what the closure actually threw rather than blaming the wire", () => {
    expect(() =>
      endpoint.via(() => {
        throw new Error("boom from user code");
      }),
    ).toThrow(/boom from user code/);
  });

  it("still names the missing wire call when the closure simply made none", () => {
    expect(() => endpoint.via((() => undefined) as never)).toThrow(/made no wire call/);
  });
});

describe("the shape recorded from a closure", () => {
  const { endpoint } = courier();

  it("names a variable a path is built from by its placeholder", () => {
    const detail = endpoint
      .variables<{ id: string; ids: string[] }>()
      .via((http, vars) => http.get(`items/${vars.id}/detail/${vars.ids.join(",")}`))
      .reads();

    expect(detail.path).toBe("items/:id/detail/:ids");
  });

  it("refuses a closure that calls the wire twice, as it describes one request", () => {
    expect(() =>
      endpoint.via((http) => {
        http.get("first");
        return http.post("second");
      }),
    ).toThrow(expect.objectContaining({ code: "ENDPOINT_EXTRA_WIRE_CALL" }));
  });

  it("refuses a method the wire does not have, which addresses no verb", () => {
    const fetching = (http: { fetch(path: string): unknown }) => http.fetch("items");

    expect(() => endpoint.via(fetching as never)).toThrow(
      expect.objectContaining({ code: "ENDPOINT_UNKNOWN_WIRE_METHOD" }),
    );
  });
});
