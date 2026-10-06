/**
 * What `mock` accepts for a source, checked by the compiler: the group and
 * endpoint names the source declares, and the response and variables each
 * endpoint takes. The bodies below are type-checked and never run.
 */
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import type { SSEEvent } from "@noverax/courier/realtime";
import { describe, expectTypeOf, it } from "vitest";

import { defineMockServer } from "../src/managed";

type User = { id: number; name: string };

const { endpoint, stream, channel } = courier();
const users = defineGroup({
  prefix: "users",
  endpoints: {
    getAll: endpoint.get("").response<User[]>(),
    getById: endpoint.get(":id").variables<{ id: number }>().response<User>(),
  },
});
const groupedApi = defineApi({ baseURL: "https://api.example", groups: { users } });
const flatApi = defineApi({
  baseURL: "https://api.example",
  endpoints: {
    listUsers: endpoint.get("users").response<User[]>(),
    getUser: endpoint.get("users/:id").variables<{ id: number }>().response<User>(),
    ticks: stream.response<{ n: number }>().get("ticks"),
  },
});
const exchangeApi = defineApi({
  baseURL: "https://api.example",
  groups: {
    files: defineGroup({
      prefix: "files",
      endpoints: { upload: endpoint.post("").variables<FormData>().response<{ size: number }>() },
    }),
    live: defineGroup({
      prefix: "live",
      endpoints: {
        chat: channel.send<{ text: string }>().response<{ text: string }>().connect("chat"),
      },
    }),
  },
});
const mixedApi = defineApi({
  baseURL: "https://api.example",
  groups: { users },
  endpoints: { health: endpoint.get("health").response<{ ok: boolean }>() },
});

describe("mock for a source with groups", () => {
  it("types the response and variables of the endpoint it names", () => {
    defineMockServer({
      source: groupedApi,
      overrides: (mock) => {
        expectTypeOf(mock("users", "getById").resolves).parameter(0).toEqualTypeOf<User>();
        mock("users", "getById").returns((ctx) => {
          expectTypeOf(ctx.variables).toEqualTypeOf<{ id: number }>();
          return { id: ctx.variables.id, name: "Ada" };
        });
      },
    });
  });

  it("rejects a group the source does not declare", () => {
    defineMockServer({
      source: groupedApi,
      overrides: (mock) => {
        // @ts-expect-error "user" is not a group of the source
        mock("user", "getById");
      },
    });
  });

  it("rejects an endpoint the group does not declare", () => {
    defineMockServer({
      source: groupedApi,
      overrides: (mock) => {
        // @ts-expect-error "getByID" is not an endpoint of users
        mock("users", "getByID");
      },
    });
  });

  it("rejects a response of the wrong type", () => {
    defineMockServer({
      source: groupedApi,
      overrides: (mock) => {
        // @ts-expect-error getById responds with a User, whose id is a number
        mock("users", "getById").resolves({ id: "1", name: "Ada" });
      },
    });
  });
});

describe("mock for a source without groups", () => {
  it("takes an endpoint by name, under the collection its path starts with", () => {
    defineMockServer({
      source: flatApi,
      overrides: (mock) => {
        expectTypeOf(mock("users", "listUsers").resolves).parameter(0).toEqualTypeOf<User[]>();
        expectTypeOf(mock("ticks", "ticks").emits)
          .parameter(0)
          .toEqualTypeOf<Array<SSEEvent<{ n: number }>>>();
      },
    });
  });

  it("rejects an endpoint the source does not declare", () => {
    defineMockServer({
      source: flatApi,
      overrides: (mock) => {
        // @ts-expect-error "deleteUser" is not an endpoint of the source
        mock("users", "deleteUser");
      },
    });
  });
});

describe("mock for a source with groups and top-level endpoints", () => {
  it("takes both", () => {
    defineMockServer({
      source: mixedApi,
      overrides: (mock) => {
        expectTypeOf(mock("users", "getAll").resolves).parameter(0).toEqualTypeOf<User[]>();
        expectTypeOf(mock("health", "health").resolves)
          .parameter(0)
          .toEqualTypeOf<{ ok: boolean }>();
      },
    });
  });

  it("rejects a grouped endpoint named outside its group", () => {
    defineMockServer({
      source: mixedApi,
      overrides: (mock) => {
        // @ts-expect-error getById belongs to users, and is not top-level
        mock("health", "getById");
      },
    });
  });
});

describe("mock for endpoints that take a form or a channel's messages", () => {
  it("hands a form's handler the fields the mock reads it into", () => {
    defineMockServer({
      source: exchangeApi,
      overrides: (mock) => {
        mock("files", "upload").returns((ctx) => {
          expectTypeOf(ctx.variables).toEqualTypeOf<
            Record<string, FormDataEntryValue | FormDataEntryValue[]>
          >();
          const file = ctx.variables.file;
          return { size: file instanceof File ? file.size : 0 };
        });
      },
    });
  });

  it("types each message a client sends a channel as the channel's send type", () => {
    defineMockServer({
      source: exchangeApi,
      overrides: (mock) => {
        mock("live", "chat").channel(() => ({
          onMessage(ctx, message) {
            expectTypeOf(message).toEqualTypeOf<{ text: string }>();
            ctx.send({ text: message.text });
          },
        }));
      },
    });
  });
});
