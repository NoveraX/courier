/**
 * A value `redact()` cannot read in full — a getter that throws, a proxy
 * whose every trap does, a revoked one — is shown with what could be read
 * and `[unreadable]` for the rest. Neither `redact()` nor the server's log
 * throws on it, and an error logged with it keeps its message.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createLogger } from "../../../src/logger/index";
import { redact } from "../../../src/utils/redact/redact";

function throwing(): never {
  throw new Error("the socket was released");
}

/* A library's error whose `response`, read lazily, throws once its socket is gone. */
function errorWithLostResponse(): Error {
  const error = new Error("upstream failed");
  Object.defineProperty(error, "response", { enumerable: true, get: throwing });
  return error;
}

function hostileProxy(): object {
  return new Proxy(
    {},
    {
      get: throwing,
      has: throwing,
      ownKeys: throwing,
      getPrototypeOf: throwing,
      getOwnPropertyDescriptor: throwing,
    },
  );
}

function revokedProxy(): object {
  const { proxy, revoke } = Proxy.revocable({}, {});
  revoke();
  return proxy;
}

describe("redact() on a value it cannot read in full", () => {
  it("shows an error's unreadable field as such, keeping its message and its stack", () => {
    const error = errorWithLostResponse();

    const shown = redact(error);

    expect(shown.message).toBe("upstream failed");
    expect(shown.stack).toBe(error.stack);
    expect(shown).toMatchObject({ response: "[unreadable]" });
  });

  it("shows an error whose message, stack and cause cannot be read", () => {
    const error = new Error("hidden");
    for (const field of ["message", "stack", "cause"]) {
      Object.defineProperty(error, field, { get: throwing, configurable: true });
    }

    const shown = redact(error);

    expect(shown).toBeInstanceOf(Error);
    expect(shown.message).toBe("[unreadable]");
    expect(shown.cause).toBe("[unreadable]");
  });

  it("keeps a record's readable fields beside the one that throws", () => {
    const record = { user: "ana" };
    Object.defineProperty(record, "lazy", { enumerable: true, get: throwing });

    expect(redact(record)).toEqual({ user: "ana", lazy: "[unreadable]" });
  });

  it.each([
    ["a proxy whose every trap throws", hostileProxy],
    ["a revoked proxy", revokedProxy],
  ])("names %s unreadable, whole and as a field", (_name, make) => {
    expect(redact(make())).toBe("[unreadable]");
    expect(redact({ inner: make() })).toEqual({ inner: "[unreadable]" });
  });
});

describe("the server's log, given a cause it cannot read in full", () => {
  beforeEach(() => {
    for (const level of ["error", "warn", "info", "log", "debug"] as const) {
      vi.spyOn(console, level).mockImplementation(() => {});
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it.each([["text"], ["json"]])(
    "writes its line as %s, naming what it could not read",
    (format) => {
      vi.stubEnv("COURIER_LOG_FORMAT", format === "json" ? "json" : undefined);
      const log = createLogger("Proxy");
      const causes = [
        errorWithLostResponse(),
        hostileProxy(),
        revokedProxy(),
        /* Neither JSON nor a string: the line's printer itself cannot read it. */
        { toJSON: throwing, toString: throwing },
      ];

      for (const cause of causes) {
        expect(() => log.warn("Upstream request failed", cause)).not.toThrow();
      }

      const lines = vi.mocked(console.warn).mock.calls.map(([, line]) => String(line));
      expect(lines).toHaveLength(causes.length);
      for (const line of lines) expect(line).toContain("Upstream request failed");
      if (format === "json") {
        for (const line of lines) expect(line).toContain("[unreadable]");
      }
    },
  );
});
