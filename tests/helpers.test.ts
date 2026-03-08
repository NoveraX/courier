import { describe, expect, it } from "vitest";
import {
  generateUrl,
  getRequestOptions,
  getUrl,
  headersToObject,
  isFormData,
  isHeaders,
  parseQueryRequest,
  pathJoin,
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

describe("parseQueryRequest", () => {
  it("parses simple query (no group)", () => {
    expect(parseQueryRequest("list")).toEqual({ group: undefined, query: "list" });
  });

  it("parses group:query format", () => {
    expect(parseQueryRequest("auth:login")).toEqual({ group: "auth", query: "login" });
  });

  it("handles empty string", () => {
    expect(parseQueryRequest("")).toEqual({ group: undefined, query: "" });
  });
});

describe("getUrl", () => {
  it("returns prefix when no basePath", () => {
    expect(getUrl("users")).toEqual({ path: "users" });
  });

  it("returns prefix when basePath is empty", () => {
    expect(getUrl("users", "")).toEqual({ path: "users" });
  });

  it("joins prefix and relative basePath", () => {
    expect(getUrl("api", "v2")).toEqual({ path: "api/v2" });
  });

  it("extracts origin from absolute URL basePath", () => {
    expect(getUrl("api", "https://example.com/v2")).toEqual({
      path: "v2",
      baseUrl: "https://example.com",
    });
  });

  it("handles absolute URL with trailing slash", () => {
    expect(getUrl("api", "https://example.com/v2/")).toEqual({
      path: "v2/",
      baseUrl: "https://example.com",
    });
  });
});

describe("generateUrl", () => {
  it("returns url unchanged when no path params", () => {
    const [url, vars, search] = generateUrl("users/list", { page: "1" });
    expect(url).toBe("users/list");
    expect(vars).toEqual({ page: "1" });
    expect(search).toEqual({});
  });

  it("compiles path params from variables", () => {
    const [url, vars] = generateUrl("users/:id", { id: "42", name: "test" });
    expect(url).toBe("users/42");
    expect(vars).toEqual({ name: "test" });
  });

  it("removes path params from variables", () => {
    const [, vars] = generateUrl("users/:id/posts/:postId", {
      id: "1",
      postId: "2",
      extra: "keep",
    });
    expect(vars).toEqual({ extra: "keep" });
  });

  it("parses query string from URL", () => {
    const [url, , search] = generateUrl("users?page=1&limit=10");
    expect(url).toBe("users");
    expect(search).toEqual({ page: "1", limit: "10" });
  });

  it("uses custom searchParametersParse", () => {
    const parser = (s: string) => ({ custom: s });
    const [, , search] = generateUrl("users?raw", undefined, undefined, parser);
    expect(search).toEqual({ custom: "raw" });
  });

  it("uses generatedPathOptions for path params", () => {
    const [url] = generateUrl("users/:id", {}, { id: "99" });
    expect(url).toBe("users/99");
  });

  it("variables override generatedPathOptions", () => {
    const [url] = generateUrl("users/:id", { id: "42" }, { id: "99" });
    expect(url).toBe("users/42");
  });

  it("uses String(undefined) when path param is missing", () => {
    const [url] = generateUrl("users/:id");
    expect(url).toBe("users/undefined");
  });

  it("removes path params from FormData", () => {
    const fd = new FormData();
    fd.append("id", "42");
    fd.append("name", "test");
    const [url, vars] = generateUrl("users/:id", fd);
    expect(url).toBe("users/42");
    expect(vars).toBeInstanceOf(FormData);
    expect((vars as FormData).has("id")).toBe(false);
    expect((vars as FormData).get("name")).toBe("test");
  });
});

describe("getRequestOptions", () => {
  it("extracts fields from plain object", () => {
    const result = getRequestOptions({
      source: "users",
      group: "auth",
      query: "login",
      variables: { email: "test@test.com" },
    });
    expect(result.source).toBe("users");
    expect(result.group).toBe("auth");
    expect(result.query).toBe("login");
    expect(result.variables).toEqual({ email: "test@test.com" });
  });

  it("handles undefined input", () => {
    const result = getRequestOptions(undefined);
    expect(result.source).toBeUndefined();
    expect(result.query).toBeUndefined();
  });

  it("extracts from FormData", () => {
    const fd = new FormData();
    fd.append("_source", "users");
    fd.append("_group", "auth");
    fd.append("_query", "login");
    fd.append("_options", JSON.stringify({ timeout: 5000 }));
    fd.append("name", "test");

    const result = getRequestOptions(fd);
    expect(result.source).toBe("users");
    expect(result.group).toBe("auth");
    expect(result.query).toBe("login");
    expect(result.options).toEqual({ timeout: 5000 });
    expect(result.variables).toBeInstanceOf(FormData);
    expect((result.variables as FormData).get("name")).toBe("test");
  });

  it("ignores invalid _options JSON in FormData", () => {
    const fd = new FormData();
    fd.append("_source", "users");
    fd.append("_query", "list");
    fd.append("_options", "not-json");

    const result = getRequestOptions(fd);
    expect(result.options).toBeUndefined();
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
