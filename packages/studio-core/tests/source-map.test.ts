import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { extractSourceMap } from "../src/source-map";

const { endpoint, stream, channel } = courier();

describe("extractSourceMap", () => {
  it("extracts source map from sources", () => {
    const api = defineApi({
      baseURL: "https://api.test.com",
      groups: {
        users: defineGroup({
          prefix: "users",
          endpoints: {
            getAll: endpoint.get("").response<{ id: number }[]>(),
            getById: endpoint.get(":id").variables<{ id: number }>().response<{ id: number }>(),
          },
        }),
      },
    });

    const result = extractSourceMap({ api });

    expect(result).toEqual({
      api: {
        baseURL: "https://api.test.com",
        groups: {
          users: {
            prefix: "users",
            endpoints: {
              getAll: {
                type: "query",
                hasVariablesSchema: false,
                hasResponseSchema: false,
                httpMethod: "GET",
              },
              getById: {
                type: "query",
                hasVariablesSchema: false,
                hasResponseSchema: false,
                httpMethod: "GET",
                path: ":id",
              },
            },
          },
        },
      },
    });
  });

  it("detects schema metadata", () => {
    const UserSchema = z.object({ id: z.number(), name: z.string() });
    const CreateSchema = z.object({ name: z.string() });

    const api = defineApi({
      baseURL: "https://api.test.com",
      groups: {
        users: defineGroup({
          prefix: "users",
          endpoints: {
            getAll: endpoint.get("").response(z.array(UserSchema)),
            create: endpoint.post("").variables(CreateSchema).response(UserSchema),
          },
        }),
      },
    });

    const result = extractSourceMap({ api });
    const users = result.api!.groups.users!;

    expect(users.endpoints.getAll).toEqual({
      type: "query",
      hasVariablesSchema: false,
      hasResponseSchema: true,
      httpMethod: "GET",
    });

    expect(users.endpoints.create).toEqual({
      type: "mutation",
      hasVariablesSchema: true,
      hasResponseSchema: true,
      httpMethod: "POST",
      variablesStub: { name: "" },
      variablesFields: [{ path: "name", type: "string", required: true }],
    });
  });

  it("carries what an endpoint's .defaults() fills in", () => {
    const api = defineApi({
      baseURL: "https://api.test.com",
      endpoints: {
        news: endpoint
          .get("news")
          .variables(z.object({ group: z.string(), groupBy: z.enum(["year", "month"]) }))
          .defaults({ groupBy: "year" }),
        latest: endpoint.get("latest").variables<{ limit: number }>().defaults({ limit: 5 }),
      },
    });

    const endpoints = extractSourceMap({ api }).api!.groups[""]!.endpoints;

    expect(endpoints.news?.variablesDefaults).toEqual({ groupBy: "year" });
    expect(endpoints.latest).toMatchObject({
      hasVariablesSchema: false,
      variablesDefaults: { limit: 5 },
    });
  });

  it("keys a group inside a group by its path, at its groups' prefixes joined", () => {
    const api = defineApi({
      baseURL: "https://api.test.com",
      groups: {
        billing: defineGroup({
          prefix: "billing",
          endpoints: { summary: endpoint.get("summary") },
          groups: {
            invoices: defineGroup({ prefix: "invoices", endpoints: { list: endpoint.get("") } }),
          },
        }),
      },
    });

    const groups = extractSourceMap({ api }).api?.groups;
    const invoices = groups?.["billing.invoices"];

    expect(Object.keys(groups ?? {})).toEqual(["billing", "billing.invoices"]);
    expect(invoices?.prefix).toBe("billing/invoices");
    expect(Object.keys(invoices?.endpoints ?? {})).toEqual(["list"]);
  });

  it("handles multiple sources", () => {
    const api = defineApi({
      baseURL: "https://api.test.com",
      groups: {
        users: defineGroup({
          prefix: "users",
          endpoints: {
            getAll: endpoint.get("").response<unknown[]>(),
          },
        }),
      },
    });

    const cms = defineApi({
      baseURL: "https://cms.test.com",
      groups: {
        posts: defineGroup({
          prefix: "posts",
          endpoints: {
            list: endpoint.get("").response<unknown[]>(),
          },
        }),
      },
    });

    const result = extractSourceMap({ api, cms });

    expect(Object.keys(result)).toEqual(["api", "cms"]);
    expect(result.api!.baseURL).toBe("https://api.test.com");
    expect(result.cms!.baseURL).toBe("https://cms.test.com");
    expect(Object.keys(result.api!.groups)).toEqual(["users"]);
    expect(Object.keys(result.cms!.groups)).toEqual(["posts"]);
  });

  it("handles empty sources", () => {
    expect(extractSourceMap({})).toEqual({});
  });

  it("extracts flat API (no groups) into empty-name group", () => {
    const api = defineApi({
      baseURL: "https://flat.api",
      endpoints: {
        healthCheck: endpoint.get("health").response<{ ok: boolean }>(),
        search: endpoint.get("search").variables<{ q: string }>().response<string[]>(),
      },
    });

    const result = extractSourceMap({ api });

    expect(result.api!.baseURL).toBe("https://flat.api");
    expect(Object.keys(result.api!.groups)).toEqual([""]);

    const flat = result.api!.groups[""]!;
    expect(flat.prefix).toBe("");
    expect(Object.keys(flat.endpoints)).toEqual(["healthCheck", "search"]);
    expect(flat.endpoints.healthCheck).toEqual({
      type: "query",
      hasVariablesSchema: false,
      hasResponseSchema: false,
      httpMethod: "GET",
      path: "health",
    });
  });

  it("stamps appOrigin onto every source entry when provided", () => {
    const api = defineApi({
      baseURL: "https://api.test.com",
      groups: {
        users: defineGroup({
          prefix: "users",
          endpoints: { list: endpoint.get("").response<unknown[]>() },
        }),
      },
    });
    const cms = defineApi({
      baseURL: "https://cms.test.com",
      groups: {
        posts: defineGroup({
          prefix: "posts",
          endpoints: { list: endpoint.get("").response<unknown[]>() },
        }),
      },
    });

    const result = extractSourceMap({ api, cms }, "http://localhost:3000");

    expect(result.api!.appOrigin).toBe("http://localhost:3000");
    expect(result.cms!.appOrigin).toBe("http://localhost:3000");
  });

  it("omits appOrigin when not provided", () => {
    const api = defineApi({
      baseURL: "https://api.test.com",
      groups: {
        users: defineGroup({
          prefix: "users",
          endpoints: { list: endpoint.get("").response<unknown[]>() },
        }),
      },
    });

    const result = extractSourceMap({ api });

    expect(result.api!.appOrigin).toBeUndefined();
  });

  it("extracts mixed API (groups + flat endpoints)", () => {
    const api = defineApi({
      baseURL: "https://mixed.api",
      groups: {
        users: defineGroup({
          prefix: "users",
          endpoints: {
            getAll: endpoint.get("").response<unknown[]>(),
          },
        }),
      },
      endpoints: {
        healthCheck: endpoint.get("health").response<boolean>(),
      },
    });

    const result = extractSourceMap({ api });

    // Both grouped and flat endpoints extracted
    expect(Object.keys(result.api!.groups).sort()).toEqual(["", "users"]);

    // Grouped
    const users = result.api!.groups.users!;
    expect(users.prefix).toBe("users");
    expect(Object.keys(users.endpoints)).toEqual(["getAll"]);

    // Flat
    const flat = result.api!.groups[""]!;
    expect(flat.prefix).toBe("");
    expect(Object.keys(flat.endpoints)).toEqual(["healthCheck"]);
  });

  it("marks a stream or a channel the app serves itself, and nothing it calls elsewhere", () => {
    const api = defineApi({
      baseURL: "https://api.test.com",
      groups: {
        live: defineGroup({
          prefix: "live",
          endpoints: {
            ticks: stream.response<{ at: number }>().get("ticks"),
            chat: channel
              .send<{ text: string }>()
              .response<{ text: string }>()
              .implement(() => ({ onMessage: () => {} })),
          },
        }),
      },
    });

    const endpoints = extractSourceMap({ api }).api?.groups.live?.endpoints;

    expect(endpoints?.chat?.served).toBe(true);
    expect(endpoints?.ticks).toBeDefined();
    expect(endpoints?.ticks).not.toHaveProperty("served");
  });
});
