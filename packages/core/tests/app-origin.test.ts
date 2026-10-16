/**
 * Tests for the `appOrigin` registry — the user-app's HTTP origin used by
 * the Studio Playground proxy executor for self-loopback requests.
 *
 * Coverage:
 *  - Storage round-trip (`setAppOrigin` + `getAppOrigin` via globalThis)
 *  - Parsing semantics (`getAppOriginParsed` happy path + edge cases)
 *  - Strict APP_ORIGIN_NOT_CONFIGURED — no `localhost:3000` magic default
 *  - Env var auto-detect precedence: `COURIER_APP_URL`, `APP_URL`, then the
 *    address a dev server or Next.js recorded of itself, else none
 *  - Malformed URL surfaces a clean error
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEV_SERVER_ORIGIN_ENV,
  detectAppOrigin,
  getAppOrigin,
  getAppOriginParsed,
  NEXT_ORIGIN_ENV,
  setAppOrigin,
} from "../src/app-origin";
import { isConfigurationError } from "../src/errors";

const APP_ORIGIN_KEY = Symbol.for("courier.app-origin");

beforeEach(() => {
  delete (globalThis as Record<symbol, unknown>)[APP_ORIGIN_KEY];
  delete process.env.COURIER_APP_URL;
  delete process.env.APP_URL;
});

afterEach(() => {
  delete (globalThis as Record<symbol, unknown>)[APP_ORIGIN_KEY];
  delete process.env.COURIER_APP_URL;
  delete process.env.APP_URL;
  vi.unstubAllEnvs();
});

// ── Storage ─────────────────────────────────────────────────────────────────

describe("setAppOrigin / getAppOrigin", () => {
  it("returns undefined when nothing is set", () => {
    expect(getAppOrigin()).toBeUndefined();
  });

  it("round-trips through globalThis", () => {
    setAppOrigin("http://localhost:3000");
    expect(getAppOrigin()).toBe("http://localhost:3000");
  });

  it("setAppOrigin(undefined) clears the registry", () => {
    setAppOrigin("http://x");
    setAppOrigin(undefined);
    expect(getAppOrigin()).toBeUndefined();
  });

  it("survives multiple set calls — last write wins", () => {
    setAppOrigin("http://first");
    setAppOrigin("http://second");
    expect(getAppOrigin()).toBe("http://second");
  });
});

// ── getAppOriginParsed ──────────────────────────────────────────────────────

describe("getAppOriginParsed", () => {
  it("parses a valid http URL into protocol + host", () => {
    setAppOrigin("http://localhost:3000");
    expect(getAppOriginParsed()).toEqual({ protocol: "http:", host: "localhost:3000" });
  });

  it("parses a valid https URL", () => {
    setAppOrigin("https://app.example.com");
    expect(getAppOriginParsed()).toEqual({ protocol: "https:", host: "app.example.com" });
  });

  it("preserves the port in the host component", () => {
    setAppOrigin("http://0.0.0.0:8080");
    expect(getAppOriginParsed()).toEqual({ protocol: "http:", host: "0.0.0.0:8080" });
  });

  it("strips path/query/hash — only protocol + host matter", () => {
    setAppOrigin("http://localhost:3000/some/path?q=1#frag");
    expect(getAppOriginParsed()).toEqual({ protocol: "http:", host: "localhost:3000" });
  });

  it("throws APP_ORIGIN_NOT_CONFIGURED when nothing is set", () => {
    let caught: unknown;
    try {
      getAppOriginParsed();
    } catch (err) {
      caught = err;
    }
    expect(isConfigurationError(caught)).toBe(true);
    expect((caught as { code: string }).code).toBe("APP_ORIGIN_NOT_CONFIGURED");
  });

  it("error message guides the user to fix it", () => {
    expect(() => getAppOriginParsed()).toThrow(/appOrigin/);
    expect(() => getAppOriginParsed()).toThrow(/COURIER_APP_URL/);
    expect(() => getAppOriginParsed()).toThrow(/no auto-fallback/i);
  });

  it("throws on a malformed URL", () => {
    setAppOrigin("not a url");
    let caught: unknown;
    try {
      getAppOriginParsed();
    } catch (err) {
      caught = err;
    }
    expect(isConfigurationError(caught)).toBe(true);
    expect((caught as { code: string }).code).toBe("APP_ORIGIN_NOT_CONFIGURED");
  });

  it("throws when host is missing (file:// style)", () => {
    setAppOrigin("file:///etc/passwd");
    expect(() => getAppOriginParsed()).toThrow();
  });
});

// ── detectAppOrigin (env var precedence) ────────────────────────────────────

describe("detectAppOrigin", () => {
  it("returns undefined when no env var is set", () => {
    expect(detectAppOrigin()).toBeUndefined();
  });

  it("returns COURIER_APP_URL when set", () => {
    process.env.COURIER_APP_URL = "http://app.example.com";
    expect(detectAppOrigin()).toBe("http://app.example.com");
  });

  it("returns APP_URL when COURIER_APP_URL is missing", () => {
    process.env.APP_URL = "http://fallback.example.com";
    expect(detectAppOrigin()).toBe("http://fallback.example.com");
  });

  it("COURIER_APP_URL wins over APP_URL when both set", () => {
    process.env.COURIER_APP_URL = "http://primary";
    process.env.APP_URL = "http://secondary";
    expect(detectAppOrigin()).toBe("http://primary");
  });

  it("ignores empty COURIER_APP_URL", () => {
    process.env.COURIER_APP_URL = "";
    process.env.APP_URL = "http://app.example.com";
    expect(detectAppOrigin()).toBe("http://app.example.com");
  });

  it("ignores empty APP_URL", () => {
    process.env.APP_URL = "";
    expect(detectAppOrigin()).toBeUndefined();
  });

  it("returns the address a dev server or Next.js recorded of itself, a dev server's first", () => {
    vi.stubEnv(NEXT_ORIGIN_ENV, "http://localhost:3000");
    expect(detectAppOrigin()).toBe("http://localhost:3000");

    vi.stubEnv(DEV_SERVER_ORIGIN_ENV, "http://localhost:5173");
    expect(detectAppOrigin()).toBe("http://localhost:5173");
  });

  it("lets what a developer sets win over what a server recorded", () => {
    vi.stubEnv(NEXT_ORIGIN_ENV, "http://localhost:3000");
    vi.stubEnv(DEV_SERVER_ORIGIN_ENV, "http://localhost:5173");
    process.env.APP_URL = "http://app.example.com";

    expect(detectAppOrigin()).toBe("http://app.example.com");
  });
});
