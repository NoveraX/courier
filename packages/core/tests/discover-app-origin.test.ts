/**
 * Learning the app's origin from the requests it serves.
 *
 * The Playground sends its calls, their headers and bodies to this origin,
 * so only a request addressed to this machine by name in its own `Host`
 * teaches it: a name another machine could answer for — whatever the first
 * sender wrote, or a page whose name points here — or one an
 * `X-Forwarded-Host` wrote, never. Adapters keep trying until a request
 * qualifies, so a host-less probe first does not leave it unset.
 */
import type { IncomingMessage } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  adoptListenOrigin,
  configuredAppOrigin,
  discoverAppOrigin,
  getAppOrigin,
  getAppOriginParsed,
  setAppOrigin,
} from "../src/app-origin";
import { discoverNodeAppOrigin } from "../src/node";

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");
});

afterEach(() => {
  setAppOrigin(undefined);
  vi.unstubAllEnvs();
});

function nodeRequest(
  headers: Record<string, string>,
  remoteAddress = "203.0.113.9",
): IncomingMessage {
  return { headers, socket: { encrypted: false, remoteAddress } } as unknown as IncomingMessage;
}

describe("discoverAppOrigin", () => {
  it("learns an origin addressed to this machine by name", () => {
    for (const host of ["localhost:3000", "127.0.0.1:5173", "[::1]:4321"]) {
      setAppOrigin(undefined);
      discoverAppOrigin(`http://${host}`, host);

      expect(getAppOrigin()).toBe(`http://${host}`);
    }
  });

  it("learns no name another machine could answer for", () => {
    for (const host of [
      "evil.example",
      "app.local:3000",
      "0.0.0.0:7990",
      "203.0.113.9:3000",
      "192.168.1.20:3000",
      "app.localhost:3000",
      "localhost.evil.example",
    ]) {
      discoverAppOrigin(`http://${host}`, host);
    }

    expect(getAppOrigin()).toBeUndefined();
  });

  it("learns nothing from an origin its own Host does not name, as one X-Forwarded-Host rewrote", () => {
    discoverAppOrigin("http://localhost:7990", "localhost:3000");
    discoverAppOrigin("http://localhost:3000", "evil.example");
    discoverAppOrigin("http://localhost:3000", undefined);
    discoverAppOrigin("http://localhost:3000", null);

    expect(getAppOrigin()).toBeUndefined();
  });

  it("learns a later qualifying request after ones that did not qualify", () => {
    discoverAppOrigin("http://evil.example", "evil.example");
    discoverAppOrigin("http://localhost:3000", "LOCALHOST:3000");

    expect(getAppOrigin()).toBe("http://localhost:3000");
  });

  it("keeps the origin that was configured", () => {
    setAppOrigin("https://configured.example");

    discoverAppOrigin("http://localhost:3000", "localhost:3000");

    expect(getAppOrigin()).toBe("https://configured.example");
  });

  it("ignores an opaque or malformed origin", () => {
    discoverAppOrigin("null", "localhost:3000");
    discoverAppOrigin("not a url", "localhost:3000");

    expect(getAppOrigin()).toBeUndefined();
  });

  it("takes none from a request in production", () => {
    vi.stubEnv("NODE_ENV", "production");

    discoverAppOrigin("http://localhost:3000", "localhost:3000");
    discoverNodeAppOrigin(nodeRequest({ host: "localhost:3000" }));

    expect(getAppOrigin()).toBeUndefined();
  });
});

describe("the origin's standing", () => {
  it("is not configured when a request taught it", () => {
    discoverAppOrigin("http://localhost:3000", "localhost:3000");

    expect(getAppOrigin()).toBe("http://localhost:3000");
    expect(configuredAppOrigin()).toBeUndefined();
  });

  it("is configured when set, or adopted from the address a server listens on", () => {
    setAppOrigin("https://shop.example");
    expect(configuredAppOrigin()).toBe("https://shop.example");

    setAppOrigin(undefined);
    adoptListenOrigin("http://192.168.1.20:3001");
    expect(configuredAppOrigin()).toBe("http://192.168.1.20:3001");
  });

  it("is configured once set over one a request taught", () => {
    discoverAppOrigin("http://localhost:3000", "localhost:3000");
    setAppOrigin("http://localhost:3000");

    expect(configuredAppOrigin()).toBe("http://localhost:3000");
  });

  it("is not adopted from a server's address over one already set, nor in production", () => {
    setAppOrigin("https://shop.example");
    adoptListenOrigin("http://127.0.0.1:3001");
    expect(getAppOrigin()).toBe("https://shop.example");

    setAppOrigin(undefined);
    vi.stubEnv("NODE_ENV", "production");
    adoptListenOrigin("http://127.0.0.1:3001");
    expect(getAppOrigin()).toBeUndefined();
  });
});

describe("discoverNodeAppOrigin", () => {
  it("is not spent by a request that carries no host", () => {
    discoverNodeAppOrigin(nodeRequest({}));
    discoverNodeAppOrigin(nodeRequest({ host: "localhost:3000" }));

    expect(getAppOrigin()).toBe("http://localhost:3000");
  });

  it("learns nothing an X-Forwarded-Host names, even from a proxy on this machine", () => {
    discoverNodeAppOrigin(
      nodeRequest({ host: "localhost:3000", "x-forwarded-host": "localhost:7990" }, "127.0.0.1"),
    );
    discoverNodeAppOrigin(
      nodeRequest({ host: "localhost:3000", "x-forwarded-host": "evil.example" }, "127.0.0.1"),
    );

    expect(getAppOrigin()).toBeUndefined();
  });
});

describe("APP_ORIGIN_NOT_CONFIGURED", () => {
  it("says when the origin is learned, and to set it everywhere else", () => {
    expect(() => getAppOriginParsed()).toThrow(
      /learned only from a request addressed to\s+localhost, 127\.0\.0\.1 or \[::1\]/,
    );
    expect(() => getAppOriginParsed()).toThrow(/COURIER_APP_URL/);
    expect(() => getAppOriginParsed()).toThrow(
      /reverse\s+proxy or a tunnel, in Docker, on a \*\.localhost name/,
    );
  });
});
