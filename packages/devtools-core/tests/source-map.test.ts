import { describe, expect, it } from "vitest";
import { defineApi, defineGroup, endpoint } from "@noverax/nexus/define";
import { z } from "zod";
import { extractSourceMap } from "../src/source-map";

describe("extractSourceMap", () => {
  it("extracts source map from sources", () => {
    const api = defineApi({
      baseURL: "https://api.test.com",
      groups: {
        users: defineGroup({
          prefix: "users",
          endpoints: {
            getAll: endpoint<{ id: number }[]>()((http) => http.get()),
            getById: endpoint<{ id: number }, { id: number }>()((http, vars) =>
              http.get(":id", vars),
            ),
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
                type: undefined,
                hasVariablesSchema: false,
                hasResponseSchema: false,
              },
              getById: {
                type: undefined,
                hasVariablesSchema: false,
                hasResponseSchema: false,
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
            getAll: endpoint({ response: z.array(UserSchema), type: "query" })((http) =>
              http.get(),
            ),
            create: endpoint({ variables: CreateSchema, response: UserSchema, type: "mutation" })(
              (http, vars) => http.post("", vars),
            ),
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
    });

    expect(users.endpoints.create).toEqual({
      type: "mutation",
      hasVariablesSchema: true,
      hasResponseSchema: true,
    });
  });

  it("handles multiple sources", () => {
    const api = defineApi({
      baseURL: "https://api.test.com",
      groups: {
        users: defineGroup({
          prefix: "users",
          endpoints: {
            getAll: endpoint<unknown[]>()((http) => http.get()),
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
            list: endpoint<unknown[]>()((http) => http.get()),
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
        healthCheck: endpoint<{ ok: boolean }>({ type: "query" })((http) => http.get("health")),
        search: endpoint<string[], { q: string }>()((http, vars) => http.get("search", vars)),
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
    });
  });

  it("extracts mixed API (groups + flat endpoints)", () => {
    const api = defineApi({
      baseURL: "https://mixed.api",
      groups: {
        users: defineGroup({
          prefix: "users",
          endpoints: {
            getAll: endpoint<unknown[]>()((http) => http.get()),
          },
        }),
      },
      endpoints: {
        healthCheck: endpoint<boolean>()((http) => http.get("health")),
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
});
