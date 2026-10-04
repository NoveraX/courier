/**
 * The HTTP version a request went over, from a protocol's name for it — an
 * ALPN id, a browser's `nextHopProtocol` — and remembered by origin, the
 * oldest origin let go once a runtime has seen many.
 */
import { describe, expect, it } from "vitest";

import {
  httpVersionFromProtocol,
  originOf,
  originVersions,
} from "../src/runtime/http-versions/http-version";

describe("httpVersionFromProtocol", () => {
  it("names the version each protocol stands for", () => {
    expect(
      ["http/1.0", "http/1.1", "HTTP/1.1", "h2", "h2c", "h3", "h3-29"].map(httpVersionFromProtocol),
    ).toEqual(["HTTP/1.0", "HTTP/1.1", "HTTP/1.1", "HTTP/2", "HTTP/2", "HTTP/3", "HTTP/3"]);
  });

  it("names none for a protocol that is not HTTP, or for none at all", () => {
    expect(httpVersionFromProtocol("spdy/3")).toBeUndefined();
    expect(httpVersionFromProtocol("")).toBeUndefined();
  });
});

describe("originVersions", () => {
  it("tells a URL's version by its origin", () => {
    const versions = originVersions();
    versions.note("https://api.example.com", "HTTP/2");

    expect(versions.versionOf("https://api.example.com/users?page=2")).toBe("HTTP/2");
    expect(versions.versionOf("https://other.example.com/users")).toBeUndefined();
    expect(versions.versionOf("not a url")).toBeUndefined();
  });

  it("keeps the version an origin was last reached over", () => {
    const versions = originVersions();
    versions.note("https://api.example.com", "HTTP/2");
    versions.note("https://api.example.com", "HTTP/3");

    expect(versions.versionOf("https://api.example.com/")).toBe("HTTP/3");
  });

  it("lets the oldest origin go once it has seen many", () => {
    const versions = originVersions();
    for (let i = 0; i <= 256; i++) versions.note(`https://host${i}.example.com`, "HTTP/1.1");

    expect(versions.versionOf("https://host0.example.com/")).toBeUndefined();
    expect(versions.versionOf("https://host256.example.com/")).toBe("HTTP/1.1");
  });

  it("reads a URL's origin, or none from one that does not parse", () => {
    expect(originOf("http://127.0.0.1:4401/users")).toBe("http://127.0.0.1:4401");
    expect(originOf("/relative")).toBeUndefined();
  });
});
