import { describe, expect, it } from "vitest";
import { defineApi, defineGroup, courier } from "@noverax/courier/define";
import { z } from "zod";
import { extractSourceMap } from "../src/source-map";

const { endpoint } = courier();

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
    });
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
});
