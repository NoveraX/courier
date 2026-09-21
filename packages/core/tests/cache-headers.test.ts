import { describe, expect, it } from "vitest";
import { applyCacheHeaders } from "../src/utils/execute-resolve";
import type { SchemaMetadata } from "../src/validation";

const cached: SchemaMetadata = { type: "query", cache: { revalidate: 60 } };

/**
 * `forwarded` is what reached the upstream; `incoming` is what the caller
 * actually sent. They differ whenever the allowlist drops something, and the
 * private-versus-shared decision has to follow the second.
 */
function headersOf(
  forwarded?: Headers,
  schema: SchemaMetadata = cached,
  incoming: Headers = new Headers(forwarded),
): Headers {
  const response = new Response(null, { status: 200 });
  applyCacheHeaders(
    response,
    schema,
    forwarded,
    new Request("https://app.example.com/api", { headers: incoming }),
  );
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
    const headers = headersOf(new Headers({ "accept-language": "en", accept: "application/json" }));

    expect(headers.get("Vary")).toBe("accept, accept-language");
  });

  it("keeps a response private when a tenant header says who is asking", () => {
    const headers = headersOf(new Headers({ "x-tenant": "acme", "accept-language": "en" }));

    expect(headers.get("Cache-Control")).toBe("private, max-age=60");
    expect(headers.get("Vary")).toBeNull();
  });

  /**
   * The decision used to read the forwarded set, so a credential the allowlist
   * does not carry upstream was invisible to it — and the answer went out
   * marked cacheable by every CDN in between.
   */
  it("keeps a response private when the credential never reached the upstream", () => {
    const headers = headersOf(
      new Headers({ accept: "application/json" }),
      cached,
      new Headers({ accept: "application/json", "x-api-key": "secret" }),
    );

    expect(headers.get("Cache-Control")).toBe("private, max-age=60");
  });

  it("treats a request it cannot see as personal", () => {
    const response = new Response(null, { status: 200 });
    applyCacheHeaders(response, cached, new Headers({ accept: "application/json" }));

    expect(response.headers.get("Cache-Control")).toBe("private, max-age=60");
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
