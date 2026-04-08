/**
 * Tests for the `appOrigin` registry — the user-app's HTTP origin used by
 * the Studio Playground proxy executor for self-loopback requests.
 *
 * Coverage:
 *  - Storage round-trip (`setAppOrigin` + `getAppOrigin` via globalThis)
 *  - Parsing semantics (`getAppOriginParsed` happy path + edge cases)
 *  - Strict APP_ORIGIN_NOT_CONFIGURED — no `localhost:3000` magic default
 *  - Env var auto-detect precedence (`NEXUS_APP_URL` > `APP_URL` > none)
 *  - Malformed URL surfaces a clean error
 *  - **Integration through `connectStudio` / `instrumentServer`**:
 *    explicit option > env var auto-detect > undefined, with the explicit
 *    option always winning over conflicting env vars.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { isConfigurationError } from "@noverax/nexus";

import {
  detectAppOrigin,
  getAppOrigin,
  getAppOriginParsed,
  setAppOrigin,
} from "../src/connect/app-origin";
import { connectStudio } from "../src/connect/connect-studio";
import { instrumentServer } from "../src/connect/instrument-server";

const APP_ORIGIN_KEY = Symbol.for("nexus.studio.app-origin");
const CONNECTION_KEY = Symbol.for("nexus.studio.connection");

beforeEach(() => {
  delete (globalThis as Record<symbol, unknown>)[APP_ORIGIN_KEY];
  delete (globalThis as Record<symbol, unknown>)[CONNECTION_KEY];
  delete process.env.NEXUS_APP_URL;
  delete process.env.APP_URL;
});

afterEach(() => {
  delete (globalThis as Record<symbol, unknown>)[APP_ORIGIN_KEY];
  delete (globalThis as Record<symbol, unknown>)[CONNECTION_KEY];
  delete process.env.NEXUS_APP_URL;
  delete process.env.APP_URL;
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
    expect(() => getAppOriginParsed()).toThrow(/NEXUS_APP_URL/);
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

  it("returns NEXUS_APP_URL when set", () => {
    process.env.NEXUS_APP_URL = "http://app.example.com";
    expect(detectAppOrigin()).toBe("http://app.example.com");
  });

  it("returns APP_URL when NEXUS_APP_URL is missing", () => {
    process.env.APP_URL = "http://fallback.example.com";
    expect(detectAppOrigin()).toBe("http://fallback.example.com");
  });

  it("NEXUS_APP_URL wins over APP_URL when both set", () => {
    process.env.NEXUS_APP_URL = "http://primary";
    process.env.APP_URL = "http://secondary";
    expect(detectAppOrigin()).toBe("http://primary");
  });

  it("ignores empty NEXUS_APP_URL", () => {
    process.env.NEXUS_APP_URL = "";
    process.env.APP_URL = "http://app.example.com";
    expect(detectAppOrigin()).toBe("http://app.example.com");
  });

  it("ignores empty APP_URL", () => {
    process.env.APP_URL = "";
    expect(detectAppOrigin()).toBeUndefined();
  });
});

// ── Integration: connectStudio + appOrigin precedence ───────────────────────

describe("connectStudio — appOrigin precedence", () => {
  it("uses the explicit `appOrigin` option when set", () => {
    const conn = connectStudio({ appOrigin: "http://explicit:3000" });
    try {
      expect(getAppOrigin()).toBe("http://explicit:3000");
    } finally {
      conn.disconnect();
    }
  });

  it("falls back to NEXUS_APP_URL env var when no explicit option", () => {
    process.env.NEXUS_APP_URL = "http://from-env:4000";
    const conn = connectStudio({});
    try {
      expect(getAppOrigin()).toBe("http://from-env:4000");
    } finally {
      conn.disconnect();
    }
  });

  it("falls back to APP_URL when NEXUS_APP_URL is unset", () => {
    process.env.APP_URL = "http://generic:5000";
    const conn = connectStudio({});
    try {
      expect(getAppOrigin()).toBe("http://generic:5000");
    } finally {
      conn.disconnect();
    }
  });

  it("explicit option wins over conflicting NEXUS_APP_URL", () => {
    process.env.NEXUS_APP_URL = "http://from-env:4000";
    const conn = connectStudio({ appOrigin: "http://explicit-wins:9000" });
    try {
      expect(getAppOrigin()).toBe("http://explicit-wins:9000");
    } finally {
      conn.disconnect();
    }
  });

  it("ends up undefined when no explicit option and no env vars are set", () => {
    const conn = connectStudio({});
    try {
      expect(getAppOrigin()).toBeUndefined();
    } finally {
      conn.disconnect();
    }
  });
});

// ── Integration: instrumentServer + appOrigin precedence ────────────────────
//
// `instrumentServer` is server-side: it short-circuits when NODE_ENV is
// production, when running in a browser, or under Next.js Edge runtime.
// Vitest defaults to NODE_ENV="test" with no `window` and no NEXT_RUNTIME,
// so the function takes the full code path and we can observe the
// resolved appOrigin via the same `getAppOrigin()` registry.

describe("instrumentServer — appOrigin precedence", () => {
  it("uses the explicit `appOrigin` option when set", () => {
    const conn = instrumentServer({
      sources: {},
      appOrigin: "http://explicit-server:3000",
    });
    try {
      expect(getAppOrigin()).toBe("http://explicit-server:3000");
    } finally {
      conn.disconnect();
    }
  });

  it("falls back to NEXUS_APP_URL env var", () => {
    process.env.NEXUS_APP_URL = "http://server-env:4000";
    const conn = instrumentServer({ sources: {} });
    try {
      expect(getAppOrigin()).toBe("http://server-env:4000");
    } finally {
      conn.disconnect();
    }
  });

  it("falls back to APP_URL when NEXUS_APP_URL is unset", () => {
    process.env.APP_URL = "http://server-generic:5000";
    const conn = instrumentServer({ sources: {} });
    try {
      expect(getAppOrigin()).toBe("http://server-generic:5000");
    } finally {
      conn.disconnect();
    }
  });

  it("explicit option wins over NEXUS_APP_URL", () => {
    process.env.NEXUS_APP_URL = "http://server-env:4000";
    const conn = instrumentServer({
      sources: {},
      appOrigin: "http://explicit-server-wins:9000",
    });
    try {
      expect(getAppOrigin()).toBe("http://explicit-server-wins:9000");
    } finally {
      conn.disconnect();
    }
  });

  it("ends up undefined when no option and no env vars", () => {
    const conn = instrumentServer({ sources: {} });
    try {
      expect(getAppOrigin()).toBeUndefined();
    } finally {
      conn.disconnect();
    }
  });

  it("explicit option wins over both NEXUS_APP_URL and APP_URL", () => {
    process.env.NEXUS_APP_URL = "http://primary-env:4000";
    process.env.APP_URL = "http://generic-env:5000";
    const conn = instrumentServer({
      sources: {},
      appOrigin: "http://explicit:9000",
    });
    try {
      expect(getAppOrigin()).toBe("http://explicit:9000");
    } finally {
      conn.disconnect();
    }
  });
});
