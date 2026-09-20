import { describe, expect, it } from "vitest";
import { applyCacheHeaders } from "../src/utils/execute-resolve";
import type { SchemaMetadata } from "../src/validation";

const cached: SchemaMetadata = { type: "query", cache: { revalidate: 60 } };

function headersOf(forwarded?: Headers, schema: SchemaMetadata = cached): Headers {
  const response = new Response(null, { status: 200 });
  applyCacheHeaders(response, schema, forwarded);
  return response.headers;
}

describe("cache directives", () => {
  it("offers a response to shared caches when nothing identified the caller", () => {
    const headers = headersOf(new Headers({ accept: "application/json" }));

    expect(headers.get("Cache-Control")).toBe("s-maxage=60, stale-while-revalidate");
    expect(headers.get("Vary")).toBe("accept");
  });

  it("keeps a response private when the request carried credentials", () => {
    const headers = headersOf(
      new Headers({ authorization: "Bearer t", accept: "application/json" }),
    );

    expect(headers.get("Cache-Control")).toBe("private, max-age=60");
    expect(headers.get("Vary")).toBeNull();
  });

  it("keeps a response private when the request carried a cookie", () => {
    const headers = headersOf(new Headers({ cookie: "sid=abc" }));

    expect(headers.get("Cache-Control")).toBe("private, max-age=60");
  });

  it("names every forwarded header a shared cache must key on", () => {
    const headers = headersOf(new Headers({ "x-tenant": "acme", "accept-language": "en" }));

    expect(headers.get("Vary")).toBe("accept-language, x-tenant");
  });

  it("still carries the tags the endpoint declared", () => {
    const headers = headersOf(new Headers(), {
      type: "query",
      cache: { revalidate: 30, tags: ["users", "list"] },
    });

    expect(headers.get("x-courier-tags")).toBe("users,list");
  });

  it("sets no directive where the endpoint declared no revalidation", () => {
    const headers = headersOf(new Headers(), { type: "query", cache: { tags: ["users"] } });

    expect(headers.get("Cache-Control")).toBeNull();
    expect(headers.get("x-courier-tags")).toBe("users");
  });
});
