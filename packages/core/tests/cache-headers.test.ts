import { describe, expect, it } from "vitest";
import { applyCacheHeaders } from "../src/utils/cache-headers";
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
   * The decision reads the request's own headers, not the forwarded set, so a
   * credential the allowlist does not carry upstream still makes the answer
   * private rather than cacheable by every CDN in between.
   */
  it("keeps a response private when the credential never reached the upstream", () => {
    const headers = headersOf(
      new Headers({ accept: "application/json" }),
      cached,
      new Headers({ accept: "application/json", "x-api-key": "secret" }),
    );

    expect(headers.get("Cache-Control")).toBe("private, max-age=60");
  });

  /**
   * Every production request passes a proxy of some kind, and Next.js adds
   * the four `x-forwarded-*` headers to each request itself. Read as
   * unfamiliar headers, they made the shared-cache answer unreachable
   * anywhere but a bare local server.
   */
  it("offers a response to shared caches when a reverse proxy stamped the request", () => {
    const headers = headersOf(
      new Headers({ accept: "application/json" }),
      cached,
      new Headers({
        accept: "application/json",
        "x-forwarded-for": "203.0.113.7",
        "x-forwarded-host": "app.example.com",
        "x-forwarded-port": "443",
        "x-forwarded-proto": "https",
        forwarded: "for=203.0.113.7;proto=https",
        via: "1.1 proxy.example",
        "x-real-ip": "203.0.113.7",
        traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
      }),
    );

    expect(headers.get("Cache-Control")).toBe("s-maxage=60, stale-while-revalidate");
  });

  it("offers a response to shared caches when a CDN stamped the request", () => {
    const headers = headersOf(
      new Headers(),
      cached,
      new Headers({
        "cf-connecting-ip": "203.0.113.7",
        "cf-ipcountry": "NL",
        "cf-ray": "8f1c2d3e4f5a6b7c-AMS",
        "cf-visitor": '{"scheme":"https"}',
        "cdn-loop": "cloudflare",
        "x-vercel-id": "fra1::abcde-1700000000000-0123456789ab",
        "x-vercel-forwarded-for": "203.0.113.7",
        "x-vercel-ip-country": "NL",
        "x-vercel-ip-city": "Amsterdam",
        "x-vercel-deployment-url": "app-abc123.vercel.app",
        "x-amzn-trace-id": "Root=1-67891233-abcdef012345678912345678",
      }),
    );

    expect(headers.get("Cache-Control")).toBe("s-maxage=60, stale-while-revalidate");
  });

  it("keeps a response private when the edge vouches for a signed-in user", () => {
    const headers = headersOf(
      new Headers(),
      cached,
      new Headers({ "cf-connecting-ip": "203.0.113.7", "cf-access-jwt-assertion": "eyJ.x.y" }),
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
