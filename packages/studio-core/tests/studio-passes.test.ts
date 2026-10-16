/**
 * The one-time passes Studio's runtime issues for Playground calls through
 * the app's proxy route: random, good once, for a short while, for the
 * process they were issued in, never in a browser, and never more of them
 * kept than a bound.
 */
import { STUDIO_PASS_HEADER, STUDIO_PASS_REDEEMER } from "@noverax/courier/internal";
import { afterEach, describe, expect, it, onTestFinished, vi } from "vitest";

import { passHeaders, withoutPassHeader } from "../src/runtime/pass-headers";
import {
  admittedOnStudioPass,
  issueStudioPass,
  revokeStudioPasses,
} from "../src/runtime/studio-passes";

const BOOK = Symbol.for("courier.studioPassBook");

function redeem(pass: unknown): unknown {
  const redeemer: unknown = Reflect.get(globalThis, STUDIO_PASS_REDEEMER);
  if (typeof redeemer !== "function") throw new Error("no redeemer");
  return Reflect.apply(redeemer, undefined, [pass]);
}

function issuedCount(): number {
  const book: unknown = Reflect.get(globalThis, BOOK);
  const issued: unknown =
    typeof book === "object" && book ? Reflect.get(book, "issued") : undefined;
  return issued instanceof Map ? issued.size : 0;
}

function issue(requestId: string): string {
  const pass = issueStudioPass(requestId);
  if (pass === undefined) throw new Error("no pass issued");
  return pass;
}

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(globalThis, BOOK);
  Reflect.deleteProperty(globalThis, STUDIO_PASS_REDEEMER);
});

describe("a pass Studio's runtime issues", () => {
  it("is 256 random bits in base64url, a new one each time", () => {
    const passes = new Set(Array.from({ length: 50 }, () => issue("pg_a")));

    expect(passes.size).toBe(50);
    for (const pass of passes) expect(pass).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("is redeemed once, and refused every time after", () => {
    const pass = issue("pg_once");

    expect(redeem(pass)).toBe(true);
    expect(redeem(pass)).toBe(false);
    expect(admittedOnStudioPass("pg_once")).toBe(true);
  });

  it("is refused once its lifetime is over, and spent by the attempt", () => {
    const now = vi.spyOn(performance, "now").mockReturnValue(1_000);
    onTestFinished(() => now.mockRestore());
    const pass = issue("pg_late");
    now.mockReturnValue(1_000 + 30_000);

    expect(redeem(pass)).toBe(false);
    now.mockReturnValue(1_000);
    expect(redeem(pass)).toBe(false);
    expect(admittedOnStudioPass("pg_late")).toBe(false);
  });

  it("is refused when it was never issued, or is not a string", () => {
    issue("pg_known");

    expect(redeem("B".repeat(43))).toBe(false);
    expect(redeem(undefined)).toBe(false);
    expect(redeem(42)).toBe(false);
    expect(admittedOnStudioPass("pg_known")).toBe(false);
  });

  it("is forgotten with the run it was issued for, used or not, and the run's mark with it", () => {
    const used = issue("pg_run");
    const unused = issue("pg_run");
    const other = issue("pg_other");
    redeem(used);

    revokeStudioPasses("pg_run");

    expect(admittedOnStudioPass("pg_run")).toBe(false);
    expect(redeem(unused)).toBe(false);
    expect(redeem(other)).toBe(true);
  });

  it("is never kept beyond a bound, the oldest going first", () => {
    const first = issue("pg_many");
    for (let index = 0; index < 400; index++) issue("pg_many");

    expect(issuedCount()).toBe(256);
    expect(redeem(first)).toBe(false);
  });

  it("is let go once expired, as the next is issued", () => {
    const now = vi.spyOn(performance, "now").mockReturnValue(0);
    onTestFinished(() => now.mockRestore());
    for (let index = 0; index < 10; index++) issue("pg_old");
    now.mockReturnValue(60_000);

    issue("pg_new");

    expect(issuedCount()).toBe(1);
  });

  it("is not issued in a browser, whose own fetch says where a call comes from", () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("document", {});

    expect(issueStudioPass("pg_page")).toBeUndefined();
    expect(passHeaders("pg_page")).toEqual({});
    expect(Reflect.get(globalThis, STUDIO_PASS_REDEEMER)).toBeUndefined();
  });

  it("puts nothing on the global object before a pass is issued", () => {
    expect(admittedOnStudioPass("pg_none")).toBe(false);
    revokeStudioPasses("pg_none");

    expect(Reflect.get(globalThis, STUDIO_PASS_REDEEMER)).toBeUndefined();
    expect(Reflect.get(globalThis, BOOK)).toBeUndefined();
  });
});

describe("the headers of a Playground call", () => {
  it("carry a fresh pass under the pass header", () => {
    const headers = passHeaders("pg_h");

    expect(Object.keys(headers)).toEqual([STUDIO_PASS_HEADER]);
    expect(redeem(headers[STUDIO_PASS_HEADER])).toBe(true);
  });

  it("lose a pass header the Playground was given, in any spelling", () => {
    expect(
      withoutPassHeader({
        "X-Courier-Studio-Pass": "a",
        "x-courier-studio-pass": "b",
        accept: "*",
      }),
    ).toEqual({ accept: "*" });
  });
});
