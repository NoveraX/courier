/**
 * What `courier-server` says once it listens: a banner in a terminal — its
 * version, address, config and sources — and one log line anywhere else,
 * or with COURIER_LOG_FORMAT=json, so a log stays a log.
 */
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import manifest from "../package.json" with { type: "json" };
import { printReady } from "../src/print-ready";

// biome-ignore lint/suspicious/noControlCharactersInRegex: it matches the ESC that starts a terminal colour
const ESCAPE = /\x1b\[[\d;]*m/g;

const READY = {
  url: "http://127.0.0.1:3001",
  configFile: join(process.cwd(), "courier.config.ts"),
  sources: ["users"],
};

let logged: string[];

beforeEach(() => {
  logged = [];
  for (const name of ["COURIER_LOG_FORMAT", "COURIER_LOG_LEVEL", "FORCE_COLOR"]) {
    vi.stubEnv(name, undefined);
  }
  vi.spyOn(console, "log").mockImplementation((...args) => {
    logged.push(args.join(" ").replace(ESCAPE, ""));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("printReady", () => {
  it("prints a banner with the version, the address, the config and the sources in a terminal", () => {
    printReady(READY, { isTTY: true });

    const text = logged.join("\n");
    expect(text).toContain(`Courier Server v${manifest.version}  ready in `);
    expect(text).toContain("Local     http://127.0.0.1:3001");
    expect(text).toContain("Config    courier.config.ts");
    expect(text).toContain("Sources   users");
  });

  it("names the first sources of a long list and counts the rest", () => {
    printReady({ ...READY, sources: ["a", "b", "c", "d", "e", "f"] }, { isTTY: true });

    expect(logged.join("\n")).toContain("Sources   a, b, c, d and 2 more");
  });

  it("logs one line instead into a pipe", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    printReady(READY, { isTTY: false });

    expect(logged).toEqual([]);
    expect(String(info.mock.calls[0]?.[1])).toContain(
      `Courier Server v${manifest.version} ready at http://127.0.0.1:3001`,
    );
  });

  it("logs one JSON line in a terminal with COURIER_LOG_FORMAT=json", () => {
    vi.stubEnv("COURIER_LOG_FORMAT", "json");
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    printReady(READY, { isTTY: true });

    expect(logged).toEqual([]);
    expect(JSON.parse(String(info.mock.calls[0]?.[1]))).toMatchObject({ scope: "cli" });
  });
});
