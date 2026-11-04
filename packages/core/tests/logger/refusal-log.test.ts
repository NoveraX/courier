/**
 * What an expected refusal leaves in the log: one line with what was
 * refused, its code and why — the thrown error's name and message, never
 * its stack, which only the debug level prints — at most once an interval
 * for each kind of refusal, the rest counted and summed up when the
 * interval is over.
 */
import { format } from "node:util";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createRefusalLog } from "../../src/logger/refusal-log";

/* A JWT, which the log's redaction knows only whole: its header and payload carry the user's claims. */
const JWT =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwiZW1haWwiOiJhbmFAZXhhbXBsZS5jb20iLCJyb2xlIjoiYWRtaW4ifQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";

const printed = {
  warn: [] as string[],
  info: [] as string[],
  debug: [] as string[],
};

beforeEach(() => {
  for (const level of ["warn", "info", "debug"] as const) {
    printed[level] = [];
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
      printed[level].push(format(...args));
    });
  }
  vi.stubEnv("COURIER_LOG_LEVEL", undefined);
  vi.stubEnv("COURIER_LOG_FORMAT", undefined);
  vi.stubEnv("NO_COLOR", "1");
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("createRefusalLog", () => {
  it("logs a refusal on one line with its code and the error's name and message, and no stack", () => {
    const refusals = createRefusalLog("WS");

    refusals.warn(
      { event: "connection refused", code: 4401, fields: { conn: "c1", addr: "9c1b2e4a" } },
      new TypeError("invalid token"),
    );

    expect(printed.warn).toHaveLength(1);
    const [line] = printed.warn;
    expect(line).toMatch(
      /courier:ws\s+connection refused code=4401 reason="TypeError: invalid token" conn=c1 addr=9c1b2e4a$/,
    );
    expect(line).not.toContain("\n");
    expect(line).not.toMatch(/\bat .+:\d+:\d+/);
  });

  it("names a refusal with no error behind it by its code alone", () => {
    const refusals = createRefusalLog("WS");

    refusals.warn({ event: "frames refused", code: 4429, fields: { conn: "c1", held: 201 } });

    expect(printed.warn[0]).toMatch(/frames refused code=4429 conn=c1 held=201$/);
  });

  it("keeps control characters and line breaks out of the line, and cuts a long reason", () => {
    const refusals = createRefusalLog("WS");

    refusals.warn(
      { event: "connection refused", code: 4401 },
      new Error(`bad\r\nframe\u0007\u2028${"held ".repeat(100)}`),
    );

    const [line = ""] = printed.warn;
    for (const unprintable of ["\r", "\n", "\u0007", "\u2028"]) {
      expect(line).not.toContain(unprintable);
    }
    const reason = /reason="([^"]*)"/.exec(line)?.[1] ?? "";
    expect(reason.startsWith("Error: bad frame held")).toBe(true);
    expect([...reason].length).toBeLessThanOrEqual(200);
    expect(reason).toMatch(/ held…$/);
  });

  it("drops the word a cut falls inside, so a credential is never shown in part", () => {
    const refusals = createRefusalLog("WS");
    const filler =
      "the upstream answered with a signature the verifier could not match while it checked the request that came in from the page";

    refusals.warn({ event: "connection refused", code: 4401 }, new Error(`${filler} ${JWT}`));

    const [line = ""] = printed.warn;
    expect(line).not.toContain(JWT.slice(0, 20));
    expect(line).toContain(`reason="Error: ${filler}…"`);
  });

  it("drops the word the read of a long reason falls inside, however short the line it leaves", () => {
    const refusals = createRefusalLog("WS");

    refusals.warn(
      { event: "connection refused", code: 4401 },
      new Error(`signature failed${" ".repeat(718)}${JWT} after it`),
    );

    const [line = ""] = printed.warn;
    expect(line).not.toContain(JWT.slice(0, 20));
    expect(line).toContain('reason="Error: signature failed…"');
  });

  it("cuts a credential out of the reason, as out of every line the server writes", () => {
    const refusals = createRefusalLog("WS");

    refusals.warn(
      { event: "connection refused", code: 4401 },
      new Error("bad token Zq9xK2vB7tYc4A"),
    );

    const [line = ""] = printed.warn;
    expect(line).not.toContain("Zq9xK2vB7tYc4A");
    expect(line).toContain('reason="Error: bad token [redacted]"');
  });

  it("quotes a field that holds spaces, quotes or an equals sign, and leaves out an absent one", () => {
    const refusals = createRefusalLog("SSE");

    refusals.warn({
      event: "stream refused",
      code: 403,
      fields: { endpoint: "[api][feed][live]", note: 'a "b" c=d', topic: undefined },
    });

    expect(printed.warn[0]).toMatch(
      /stream refused code=403 endpoint=\[api\]\[feed\]\[live\] note="a \\"b\\" c=d"$/,
    );
  });

  it("describes a thrown value that is not an error by its kind, a string by itself", () => {
    const refusals = createRefusalLog("WS");

    refusals.warn({ event: "connection refused", code: 4401 }, "expired");
    refusals.warn({ event: "subscription refused", code: 4403 }, { secret: "s3cr3t" });

    expect(printed.warn[0]).toContain('reason="expired"');
    expect(printed.warn[1]).toContain('reason="a thrown object"');
    expect(printed.warn[1]).not.toContain("s3cr3t");
  });

  it("prints the thrown error with its stack at the debug level only, on a line of its own", () => {
    const refusals = createRefusalLog("WS");
    const error = new Error("invalid token");

    refusals.warn({ event: "connection refused", code: 4401 }, error);
    expect(printed.debug).toEqual([]);

    vi.stubEnv("COURIER_LOG_LEVEL", "debug");
    refusals.warn({ event: "subscription refused", code: 4403 }, error);

    expect(printed.debug).toHaveLength(1);
    expect(printed.debug[0]).toContain("subscription refused code=4403: what was thrown");
    expect(printed.debug[0]).toContain(error.stack?.split("\n")[1]?.trim() ?? "no stack");
  });

  it("prints a kind of refusal once an interval, then says how many more came", () => {
    vi.useFakeTimers();
    const refusals = createRefusalLog("WS", { intervalMs: 10_000 });

    for (let i = 0; i < 38; i++) {
      refusals.warn({ event: "connection refused", code: 4401, fields: { conn: `c${i}` } });
    }
    expect(printed.warn).toHaveLength(1);
    expect(printed.warn[0]).toContain("conn=c0");

    vi.advanceTimersByTime(10_000);

    expect(printed.warn).toHaveLength(2);
    expect(printed.warn[1]).toMatch(/connection refused code=4401: 37 more in the last 10s$/);
  });

  it("counts each kind of refusal apart: another event or another code prints at once", () => {
    vi.useFakeTimers();
    const refusals = createRefusalLog("WS");

    refusals.warn({ event: "connection refused", code: 4401 });
    refusals.warn({ event: "connection refused", code: 4403 });
    refusals.warn({ event: "credentials refused", code: 4401 });
    refusals.warn({ event: "connection refused", code: 4401 });

    expect(printed.warn).toHaveLength(3);
  });

  it("prints the next refusal of a kind in full once its interval is over", () => {
    vi.useFakeTimers();
    const refusals = createRefusalLog("WS", { intervalMs: 1_000 });

    refusals.warn({ event: "connection refused", code: 4401, fields: { conn: "c1" } });
    vi.advanceTimersByTime(1_000);
    refusals.warn({ event: "connection refused", code: 4401, fields: { conn: "c2" } });

    expect(printed.warn).toHaveLength(2);
    expect(printed.warn[1]).toContain("conn=c2");
  });

  it("leaves no timer behind once nothing is waiting to be summed up", () => {
    vi.useFakeTimers();
    const refusals = createRefusalLog("WS", { intervalMs: 1_000 });

    refusals.warn({ event: "connection refused", code: 4401 });
    expect(vi.getTimerCount()).toBe(0);
    refusals.warn({ event: "connection refused", code: 4401 });
    expect(vi.getTimerCount()).toBe(1);

    vi.advanceTimersByTime(1_000);

    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps no more kinds than it may, summing up the one it lets go of first", () => {
    vi.useFakeTimers();
    const refusals = createRefusalLog("WS", { maxKeys: 2 });

    refusals.warn({ event: "a", code: 1 });
    refusals.warn({ event: "a", code: 1 });
    refusals.warn({ event: "b", code: 1 });
    refusals.warn({ event: "c", code: 1 });

    expect(printed.warn).toEqual([
      expect.stringMatching(/ a code=1$/),
      expect.stringMatching(/ b code=1$/),
      expect.stringMatching(/ a code=1: 1 more in the last 10s$/),
      expect.stringMatching(/ c code=1$/),
    ]);
  });

  it("logs at the info level when asked to", () => {
    const refusals = createRefusalLog("WS");

    refusals.info({ event: "channel left unexposed", code: 4403 });

    expect(printed.info).toHaveLength(1);
    expect(printed.warn).toEqual([]);
  });

  it("writes the same text as the message of a JSON line", () => {
    vi.stubEnv("COURIER_LOG_FORMAT", "json");
    const refusals = createRefusalLog("WS");

    refusals.warn({ event: "connection refused", code: 4401 }, new Error("invalid token"));

    const record: unknown = JSON.parse(printed.warn[0] ?? "");
    expect(record).toMatchObject({
      level: "warn",
      scope: "ws",
      message: 'connection refused code=4401 reason="Error: invalid token"',
    });
    expect(record).not.toHaveProperty("error");
  });
});
