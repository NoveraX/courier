/**
 * A path's `:name` parameters come from the variables, so an endpoint whose
 * variables leave one out, or declare none, does not compile — rather than
 * failing every call at run time with "Missing required path parameter".
 */
import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";

import { createCaller } from "../src/caller";
import type { InferVariables, PathParamNames } from "../src/define/index";
import { courier, defineApi } from "../src/define/index";

const { endpoint, stream, channel } = courier();

describe("the names of a path's parameters", () => {
  it("are read as the request is built", () => {
    expectTypeOf<PathParamNames<"orgs/:orgId/users/:id.json">>().toEqualTypeOf<"orgId" | "id">();
    expectTypeOf<PathParamNames<"v1/:name:cancel">>().toEqualTypeOf<"name" | "cancel">();
    expectTypeOf<PathParamNames<"a/:1/b">>().toBeNever();
    expectTypeOf<PathParamNames<string>>().toBeNever();
  });

  it("read a doubled colon as one colon the path sends as written", () => {
    expectTypeOf<PathParamNames<"v1/urlInspection/index::inspect">>().toBeNever();
    expectTypeOf<PathParamNames<"v1/:name::cancel">>().toEqualTypeOf<"name">();
    expectTypeOf<PathParamNames<"rates/:::pair">>().toEqualTypeOf<"pair">();
    expectTypeOf<PathParamNames<"a::::b">>().toBeNever();
  });

  it("are not read in an absolute URL's scheme and host", () => {
    expectTypeOf<PathParamNames<"https://[2001:db8::1]:8443/users/:id">>().toEqualTypeOf<"id">();
    expectTypeOf<PathParamNames<"https://user:secret@api.test/v1">>().toBeNever();
    expectTypeOf<PathParamNames<"wss://host.test:9000">>().toBeNever();
    expectTypeOf<PathParamNames<":proto://host/:id">>().toEqualTypeOf<"proto" | "id">();
  });
});

describe("a path with a colon it sends as written", () => {
  it("asks the variables for its parameters alone", () => {
    const inspect = endpoint.post("v1/urlInspection/index::inspect").response<unknown>();
    const cancel = endpoint.post("v1/:name::cancel").response<unknown>();

    expectTypeOf<InferVariables<typeof inspect>>().toEqualTypeOf<void>();
    expectTypeOf<InferVariables<typeof cancel>>().toEqualTypeOf<{ name: string | number }>();

    const typeOnly = () => {
      endpoint.post(":spreadsheetId::batchUpdate").variables<{ spreadsheetId: string }>();
      // @ts-expect-error — the variables do not name :spreadsheetId
      endpoint.post(":spreadsheetId::batchUpdate").variables<{ batchUpdate: string }>();
    };
    expect(typeOnly).toBeTypeOf("function");
  });
});

describe("an endpoint that declares no variables", () => {
  it("takes its path's parameters as its variables, each required", () => {
    const getUser = endpoint.get("users/:id").response<{ id: string }>();
    const list = endpoint.get("users").response<string[]>();

    expectTypeOf<InferVariables<typeof getUser>>().toEqualTypeOf<{ id: string | number }>();
    expectTypeOf<InferVariables<typeof list>>().toEqualTypeOf<void>();

    const typeOnly = () => {
      const caller = createCaller(defineApi({ baseURL: "https://x.test", endpoints: { getUser } }));
      void caller.getUser({ id: 1 });
      // @ts-expect-error — the parameter is required
      void caller.getUser();
    };
    expect(typeOnly).toBeTypeOf("function");
  });
});

describe("variables declared after the path", () => {
  it("must name each of its parameters", () => {
    const typeOnly = () => {
      endpoint.get(":id").variables<{ id: number; q?: string }>();
      endpoint.get(":id").variables<{ id?: number }>();
      endpoint.get(":id").variables(z.object({ id: z.string() }));
      // @ts-expect-error — the variables do not name :id
      endpoint.get(":id").variables<{ slug: string }>();
      // @ts-expect-error — nor does the schema
      endpoint.get(":id").variables(z.object({ slug: z.string() }));
      // @ts-expect-error — :b is left out
      endpoint.put(":a/:b").variables<{ a: string }>();
      stream.get("feeds/:room").variables<{ room: string }>();
      // @ts-expect-error — a stream's path is checked the same way
      stream.get("feeds/:room").variables<{ since: number }>();
      channel.connect("rooms/:room").variables<{ room: string }>();
    };
    expect(typeOnly).toBeTypeOf("function");
  });

  it("fill no parameter by name when they are a form, a raw body or unknown, and are not checked", () => {
    const typeOnly = () => {
      endpoint.post(":id/files").variables<FormData>();
      endpoint.put(":id/blob").variables<Blob>();
      endpoint.post(":id").variables<unknown>();
    };
    expect(typeOnly).toBeTypeOf("function");
  });
});

describe("variables declared before the path", () => {
  it("must name each of its parameters", () => {
    const typeOnly = () => {
      endpoint.variables<{ id: string }>().get("users/:id");
      endpoint.variables(z.record(z.string(), z.unknown())).get("users/:id");
      // @ts-expect-error — the variables do not name :id
      endpoint.variables<{ slug: string }>().get("users/:id");
      // @ts-expect-error — a channel's path is checked the same way
      channel.variables<{ nick: string }>().connect("rooms/:room");
    };
    expect(typeOnly).toBeTypeOf("function");
  });
});
