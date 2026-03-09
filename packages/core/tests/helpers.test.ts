import { describe, expect, it } from "vitest";
import {
  compileUrl,
  headersToObject,
  isFormData,
  isHeaders,
  parseEndpointKey,
  parseRequestPayload,
  pathJoin,
  resolveBasePath,
} from "../src/utils/helpers";

describe("pathJoin", () => {
  it("joins parts with /", () => {
    expect(pathJoin(["users", "list"])).toBe("users/list");
  });

  it("removes duplicate slashes", () => {
    expect(pathJoin(["users/", "/list"])).toBe("users/list");
  });

  it("removes leading slash", () => {
    expect(pathJoin(["/api", "users"])).toBe("api/users");
  });

  it("handles empty parts", () => {
    expect(pathJoin(["", "users"])).toBe("users");
  });

  it("handles single part", () => {
    expect(pathJoin(["users"])).toBe("users");
  });
});

describe("parseEndpointKey", () => {
  it("parses simple method (no group)", () => {
    expect(parseEndpointKey("list")).toEqual({ group: undefined, method: "list" });
  });

  it("parses group:method format", () => {
    expect(parseEndpointKey("auth:login")).toEqual({ group: "auth", method: "login" });
  });

  it("handles empty string", () => {
    expect(parseEndpointKey("")).toEqual({ group: undefined, method: "" });
  });
});

describe("resolveBasePath", () => {
  it("returns prefix when no basePath", () => {
    expect(resolveBasePath("users")).toEqual({ path: "users" });
  });

  it("returns prefix when basePath is empty", () => {
    expect(resolveBasePath("users", "")).toEqual({ path: "users" });
  });

  it("joins prefix and relative basePath", () => {
    expect(resolveBasePath("api", "v2")).toEqual({ path: "api/v2" });
  });

  it("extracts origin from absolute URL basePath", () => {
    expect(resolveBasePath("api", "https://example.com/v2")).toEqual({
      path: "v2",
      baseUrl: "https://example.com",
    });
  });

  it("handles absolute URL with trailing slash", () => {
    expect(resolveBasePath("api", "https://example.com/v2/")).toEqual({
      path: "v2/",
      baseUrl: "https://example.com",
    });
  });
});

describe("compileUrl", () => {
  it("returns url unchanged when no path params", () => {
    const [url, vars, search] = compileUrl("users/list", { page: "1" });
    expect(url).toBe("users/list");
    expect(vars).toEqual({ page: "1" });
    expect(search).toEqual({});
  });

  it("compiles path params from variables", () => {
    const [url, vars] = compileUrl("users/:id", { id: "42", name: "test" });
    expect(url).toBe("users/42");
    expect(vars).toEqual({ name: "test" });
  });

  it("removes path params from variables", () => {
    const [, vars] = compileUrl("users/:id/posts/:postId", {
      id: "1",
      postId: "2",
      extra: "keep",
    });
    expect(vars).toEqual({ extra: "keep" });
  });

  it("parses query string from URL", () => {
    const [url, , search] = compileUrl("users?page=1&limit=10");
    expect(url).toBe("users");
    expect(search).toEqual({ page: "1", limit: "10" });
  });

  it("uses custom searchParamsSerializer.parse", () => {
    const serializer = {
      stringify: (obj: Record<string, unknown>) => new URLSearchParams(Object.entries(obj).map(([k, v]) => [k, String(v)])).toString(),
      parse: (s: string) => ({ custom: s }),
    };
    const [, , search] = compileUrl("users?raw", undefined, undefined, serializer);
    expect(search).toEqual({ custom: "raw" });
  });

  it("uses generatedPathOptions for path params", () => {
    const [url] = compileUrl("users/:id", {}, { id: "99" });
    expect(url).toBe("users/99");
  });

  it("variables override generatedPathOptions", () => {
    const [url] = compileUrl("users/:id", { id: "42" }, { id: "99" });
    expect(url).toBe("users/42");
  });

  it("uses String(undefined) when path param is missing", () => {
    const [url] = compileUrl("users/:id");
    expect(url).toBe("users/undefined");
  });

  it("removes path params from FormData", () => {
    const fd = new FormData();
    fd.append("id", "42");
    fd.append("name", "test");
    const [url, vars] = compileUrl("users/:id", fd);
    expect(url).toBe("users/42");
    expect(vars).toBeInstanceOf(FormData);
    expect((vars as FormData).has("id")).toBe(false);
    expect((vars as FormData).get("name")).toBe("test");
  });
});

describe("parseRequestPayload", () => {
  it("extracts fields from plain object", () => {
    const result = parseRequestPayload({
      source: "users",
      group: "auth",
      method: "login",
      variables: { email: "test@test.com" },
    });
    expect(result.source).toBe("users");
    expect(result.group).toBe("auth");
    expect(result.method).toBe("login");
    expect(result.variables).toEqual({ email: "test@test.com" });
  });

  it("handles undefined input", () => {
    const result = parseRequestPayload(undefined);
    expect(result.source).toBeUndefined();
    expect(result.method).toBeUndefined();
  });

  it("extracts from FormData", () => {
    const fd = new FormData();
    fd.append("_source", "users");
    fd.append("_group", "auth");
    fd.append("_method", "login");
    fd.append("_options", JSON.stringify({ timeout: 5000 }));
    fd.append("name", "test");

    const result = parseRequestPayload(fd);
    expect(result.source).toBe("users");
    expect(result.group).toBe("auth");
    expect(result.method).toBe("login");
    expect(result.options).toEqual({ timeout: 5000 });
    expect(result.variables).toBeInstanceOf(FormData);
    expect((result.variables as FormData).get("name")).toBe("test");
  });

  it("ignores invalid _options JSON in FormData", () => {
    const fd = new FormData();
    fd.append("_source", "users");
    fd.append("_method", "list");
    fd.append("_options", "not-json");

    const result = parseRequestPayload(fd);
    expect(result.options).toBeUndefined();
  });

  it("preserves multiple files with the same field name", () => {
    const fd = new FormData();
    fd.append("_source", "files");
    fd.append("_method", "upload");
    fd.append("files", new File(["a"], "a.txt"));
    fd.append("files", new File(["b"], "b.txt"));
    fd.append("files", new File(["c"], "c.txt"));

    const result = parseRequestPayload(fd);
    const vars = result.variables as FormData;
    expect(vars.getAll("files")).toHaveLength(3);
  });

  it("does not include meta keys in variables FormData", () => {
    const fd = new FormData();
    fd.append("_source", "files");
    fd.append("_group", "uploads");
    fd.append("_method", "create");
    fd.append("_options", JSON.stringify({ timeout: 1000 }));
    fd.append("name", "test");

    const result = parseRequestPayload(fd);
    const vars = result.variables as FormData;
    expect(vars.has("_source")).toBe(false);
    expect(vars.has("_group")).toBe(false);
    expect(vars.has("_method")).toBe(false);
    expect(vars.has("_options")).toBe(false);
    expect(vars.get("name")).toBe("test");
  });

  it("rejects prototype pollution in _options JSON", () => {
    const fd = new FormData();
    fd.append("_source", "users");
    fd.append("_method", "list");
    fd.append("_options", JSON.stringify({ __proto__: { admin: true }, timeout: 5000 }));

    const result = parseRequestPayload(fd);
    expect(result.options).toBeDefined();
    expect(result.options).not.toHaveProperty("__proto__");
    expect(result.options).toHaveProperty("timeout", 5000);
    expect(Object.getPrototypeOf(result.options)).toBe(Object.prototype);
  });
});

describe("headersToObject", () => {
  it("returns undefined for no headers", () => {
    expect(headersToObject()).toBeUndefined();
  });

  it("converts Headers to plain object", () => {
    const h = new Headers({ "content-type": "application/json", authorization: "Bearer xxx" });
    expect(headersToObject(h)).toEqual({
      "content-type": "application/json",
      authorization: "Bearer xxx",
    });
  });
});

describe("isFormData", () => {
  it("returns true for FormData", () => {
    expect(isFormData(new FormData())).toBe(true);
  });

  it("returns false for plain object", () => {
    expect(isFormData({})).toBe(false);
  });

  it("returns false for null/undefined", () => {
    expect(isFormData(null)).toBe(false);
    expect(isFormData(undefined)).toBe(false);
  });
});

describe("isHeaders", () => {
  it("returns true for Headers", () => {
    expect(isHeaders(new Headers())).toBe(true);
  });

  it("returns false for plain object", () => {
    expect(isHeaders({})).toBe(false);
  });

  it("returns false for null", () => {
    expect(isHeaders(null)).toBe(false);
  });
});
