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

  it("keeps generatedPathOptions over a variable of the same name", () => {
    const [url] = compileUrl("users/:id", { id: "42" }, { id: "99" });
    expect(url).toBe("users/99");
  });

  it("throws HTTPError when path param is missing", () => {
    expect(() => compileUrl("users/:id")).toThrow();
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
