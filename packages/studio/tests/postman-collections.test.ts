import { describe, expect, it } from "vitest";

import { parseSpec } from "../src/apis/parser";

function collection(items: unknown[], extra: Record<string, unknown> = {}) {
  return parseSpec(
    JSON.stringify({
      info: {
        name: "C",
        schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
      },
      item: items,
      ...extra,
    }),
  );
}

function endpoints(spec: ReturnType<typeof collection>) {
  return spec.groups.flatMap((g) => g.endpoints);
}

const structuredUrl = {
  raw: "https://api.example.com/2/users/{{userId}}/tweets?max_results=10",
  protocol: "https",
  host: ["api", "example", "com"],
  path: ["2", "users", "{{userId}}", "tweets"],
  query: [{ key: "max_results", value: "10" }],
};

describe("a Postman URL", () => {
  it("gives its host to the base URL", () => {
    /* Hardcoding "/" pointed the generated client at the caller's own
       origin — every one of 183 endpoints across three real collections. */
    const spec = collection([
      { name: "List tweets", request: { method: "GET", url: structuredUrl } },
    ]);

    expect(spec.baseURL).toBe("https://api.example.com");
  });

  it("turns a Postman variable into a path parameter", () => {
    const spec = collection([
      { name: "List tweets", request: { method: "GET", url: structuredUrl } },
    ]);
    const endpoint = endpoints(spec)[0];

    expect(endpoint?.fullPath).toBe("/2/users/:userId/tweets");
    expect(endpoint?.path).not.toMatch(/[{}]/);
  });

  it("keeps its query and path parameters", () => {
    const spec = collection([
      { name: "List tweets", request: { method: "GET", url: structuredUrl } },
    ]);
    const names = endpoints(spec)[0]?.parameters.map((p) => `${p.in}:${p.name}`) ?? [];

    expect(names).toContain("query:max_results");
    expect(names).toContain("path:userId");
  });

  it("reads a raw URL when there is no structured one", () => {
    const spec = collection([
      { name: "Get", request: { method: "GET", url: "https://api.example.com/v1/items/{{id}}" } },
    ]);

    expect(spec.baseURL).toBe("https://api.example.com");
    expect(endpoints(spec)[0]?.fullPath).toBe("/v1/items/:id");
  });
});

describe("a Postman body", () => {
  it("is read when the mode is urlencoded", () => {
    const spec = collection([
      {
        name: "Create",
        request: {
          method: "POST",
          url: structuredUrl,
          body: { mode: "urlencoded", urlencoded: [{ key: "title", value: "hi" }] },
        },
      },
    ]);

    expect(Object.keys(endpoints(spec)[0]?.requestBody?.properties ?? {})).toEqual(["title"]);
  });

  it("describes a nested object as an object", () => {
    /* Typing every nested value as `string` described the body as something
       it is not. */
    const spec = collection([
      {
        name: "Create",
        request: {
          method: "POST",
          url: structuredUrl,
          body: { mode: "raw", raw: JSON.stringify({ user: { id: 1 }, tags: ["a"] }) },
        },
      },
    ]);
    const body = endpoints(spec)[0]?.requestBody;

    expect(body?.properties?.user?.type).toBe("object");
    expect(body?.properties?.tags?.type).toBe("array");
  });
});

describe("Postman authentication", () => {
  it("is carried from the collection", () => {
    const spec = collection([{ name: "Get", request: { method: "GET", url: structuredUrl } }], {
      auth: { type: "bearer" },
    });

    expect(spec.securitySchemes).toHaveLength(1);
    expect(endpoints(spec)[0]?.secured).toBe(true);
  });

  it("is carried from a request that declares its own", () => {
    const spec = collection([
      { name: "Get", request: { method: "GET", url: structuredUrl, auth: { type: "basic" } } },
    ]);

    expect(spec.securitySchemes.map((s) => s.type)).toEqual(["basic"]);
  });
});
