import { describe, expect, it } from "vitest";
import { z } from "zod";
import { courier } from "../src/define/courier";
import { ENDPOINT_SCHEMA } from "../src/define/marker";

const UserSchema = z.object({ id: z.string() });
const ById = z.object({ id: z.string() });

function meta(endpoint: unknown): Record<string, unknown> {
  return (endpoint as { [ENDPOINT_SCHEMA]: Record<string, unknown> })[ENDPOINT_SCHEMA];
}

/**
 * The verb says where an endpoint is and whether it reads. Everything else
 * refines it, and may be named on either side of the verb — there is only one
 * place to say what the endpoint does, so there is nowhere for two answers to
 * disagree.
 */
describe("the verb that addresses an endpoint", () => {
  const { endpoint, stream, channel } = courier();

  it("decides the kind without being told", () => {
    expect(endpoint.get("").kind).toBe("query");
    expect(endpoint.head("").kind).toBe("query");
    expect(endpoint.post("").kind).toBe("mutation");
    expect(endpoint.put("").kind).toBe("mutation");
    expect(endpoint.patch("").kind).toBe("mutation");
    expect(endpoint.del("").kind).toBe("mutation");
  });

  it("describes the same endpoint from either side", () => {
    const first = endpoint.get(":id").variables(ById).response(UserSchema);
    const last = endpoint.variables(ById).response(UserSchema).get(":id");

    expect(first.method).toBe(last.method);
    expect(first.path).toBe(last.path);
    expect(first.kind).toBe(last.kind);
    expect(meta(first)).toEqual(meta(last));
  });

  it("reads the descriptor as data, with the builder hidden from it", () => {
    const one = endpoint.get(":id").response(UserSchema);

    expect(Object.keys(one)).toEqual(["kind", "method", "path", "probe", "served", "options"]);
    expect(JSON.parse(JSON.stringify({ kind: one.kind, path: one.path }))).toEqual({
      kind: "query",
      path: ":id",
    });
  });

  it("takes a write-shaped call for a read where the API answers one that way", () => {
    const search = endpoint.post("search").reads().response(UserSchema);

    expect(search.method).toBe("post");
    expect(search.kind).toBe("query");
    expect(meta(search).type).toBe("query");
  });

  it("assumes a closure writes, since a cacheable write is the dangerous mistake", () => {
    const computed = endpoint
      .variables<{ ids: string[] }>()
      .via((http, vars) => http.get(`items/${vars.ids.join(",")}`));

    expect(computed.kind).toBe("mutation");
    expect(computed.reads().kind).toBe("query");
  });

  it("keeps a stream and a channel their own kind, whatever the verb underneath", () => {
    expect(stream.get("feed").kind).toBe("stream");
    expect(channel.connect("room").kind).toBe("channel");
    expect(channel.connect("room").method).toBe("get");
  });

  it("refuses to keep an answer an endpoint that writes never had", () => {
    function rejected(): void {
      // @ts-expect-error a write has no answer worth keeping
      endpoint.post("").cache({ revalidate: 60 });
    }

    expect(rejected).toBeTypeOf("function");
    expect(endpoint.post("").reads().cache({ revalidate: 60 }).kind).toBe("query");
  });
});
