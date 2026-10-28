/**
 * @vitest-environment node
 *
 * The digest of what a reading of the routes depended on: it holds while
 * no file and no variable the reading looked at changes, moves when one
 * does, and matches nothing when a file changed after the reading began.
 */
import { mkdtempSync, realpathSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fingerprintOf, UNSETTLED } from "../../src/engine/fingerprint";
import type { RoutesSnapshot } from "../../src/engine/routes-snapshot";

let dir: string;
let api: string;

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "courier-fingerprint-")));
  api = join(dir, "api.ts");
  writeFileSync(api, "export const api = {};\n");
  const earlier = new Date(Date.now() - 60_000);
  utimesSync(api, earlier, earlier);
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});

function snapshot(env: RoutesSnapshot["env"], files: string[] = [api]): RoutesSnapshot {
  return { configFile: join(dir, "courier.config.ts"), routes: {}, files, env };
}

describe("fingerprintOf", () => {
  it("holds while nothing the reading depended on changes", () => {
    expect(fingerprintOf(snapshot(["SHOP_PUBLIC"]))).toBe(fingerprintOf(snapshot(["SHOP_PUBLIC"])));
  });

  it("moves when a file the reading read changes", () => {
    const before = fingerprintOf(snapshot([]));

    writeFileSync(api, "export const api = { shop: true };\n");

    expect(fingerprintOf(snapshot([]))).not.toBe(before);
  });

  it("moves when a file the reading looked for appears", () => {
    const absent = join(dir, ".env.local");
    const before = fingerprintOf(snapshot([], [api, absent]));

    writeFileSync(absent, "SHOP_PUBLIC=1\n");

    expect(fingerprintOf(snapshot([], [api, absent]))).not.toBe(before);
  });

  it("moves when a variable the reading looked at changes, and is set or unset", () => {
    const unset = fingerprintOf(snapshot(["SHOP_PUBLIC"]));
    vi.stubEnv("SHOP_PUBLIC", "");
    const empty = fingerprintOf(snapshot(["SHOP_PUBLIC"]));
    vi.stubEnv("SHOP_PUBLIC", "1");

    expect(new Set([unset, empty, fingerprintOf(snapshot(["SHOP_PUBLIC"]))]).size).toBe(3);
  });

  it("moves with any variable when the reading went through them all", () => {
    const before = fingerprintOf(snapshot("*"));

    vi.stubEnv("COURIER_FINGERPRINT_PROBE", "1");

    expect(fingerprintOf(snapshot("*"))).not.toBe(before);
  });

  it("matches nothing when a file changed after the reading began", () => {
    const since = Date.now();

    writeFileSync(api, "export const api = { during: true };\n");

    expect(fingerprintOf(snapshot([]), since)).toBe(UNSETTLED);
  });
});
