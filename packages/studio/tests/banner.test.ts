/**
 * What the startup banner writes.
 *
 * Every address starts in one column; neither a terminal reset nor colour
 * codes go into a pipe or a log file; colour follows the decision every
 * log line follows — FORCE_COLOR, then NO_COLOR and TERM=dumb, then the
 * terminal; and with COURIER_LOG_FORMAT=json the banner is one log line.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { printBanner } from "../src/server/banner";
import { clearStartupIssues, recordStartupIssue } from "../src/server/startup-issues";

// biome-ignore lint/suspicious/noControlCharactersInRegex: it matches the ESC that starts a terminal colour
const ESCAPE = /\x1b\[[\d;]*m/g;

let logged: string[];
let written: string[];
const wasTTY = process.stdout.isTTY;

beforeEach(() => {
  clearStartupIssues();
  logged = [];
  written = [];
  for (const name of ["FORCE_COLOR", "NO_COLOR", "TERM", "COURIER_LOG_FORMAT"]) {
    vi.stubEnv(name, undefined);
  }
  vi.spyOn(console, "log").mockImplementation((...args) => {
    logged.push(args.join(" "));
  });
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    written.push(String(chunk));
    return true;
  });
});

afterEach(() => {
  process.stdout.isTTY = wasTTY;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

const text = () => logged.join("\n").replace(ESCAPE, "");

describe("printBanner", () => {
  it("starts every address in one column", () => {
    process.stdout.isTTY = true;
    printBanner("1.2.3", { local: "http://localhost:6280", network: ["http://192.0.2.10:6280"] });

    const rows = text()
      .split("\n")
      .filter((line) => line.includes("http://"));
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((row) => row.indexOf("http://"))).size).toBe(1);
  });

  it("prints the version, how long Studio took to start, and each address", () => {
    printBanner("1.2.3", {
      local: "http://localhost:6280",
      network: ["http://[2001:db8::5]:6280"],
    });

    expect(text()).toContain("Courier Studio v1.2.3  ready in ");
    expect(text()).toContain("Local     http://localhost:6280");
    expect(text()).toContain("Network   http://[2001:db8::5]:6280");
  });

  it("says a page opened without the links' token can only look", () => {
    printBanner("1.2.3", { local: "http://localhost:6280/#token=k3y", network: [] });

    expect(text()).toContain("Open a link above: without its token a page can only look.");
  });

  it("prints no network row when Studio is not on the network", () => {
    printBanner("1.2.3", { local: "http://localhost:6280", network: [] });

    expect(text()).not.toContain("Network");
  });

  it("restates a problem met during startup, and keeps the screen", () => {
    process.stdout.isTTY = true;
    recordStartupIssue("courier.config.ts failed to load", new Error("Unexpected token"));

    printBanner("1.2.3", { local: "http://localhost:6280", network: [] });

    expect(text()).toContain("▲  courier.config.ts failed to load: Unexpected token");
    expect(written.join("")).toBe("");
  });

  it("writes neither a reset nor colour into a pipe", () => {
    process.stdout.isTTY = false;
    printBanner("1.2.3", { local: "http://localhost:6280", network: [] });

    expect(written.join("")).toBe("");
    expect(logged.join("\n")).not.toMatch(ESCAPE);
  });

  it("writes no colour to a terminal that says it shows none", () => {
    process.stdout.isTTY = true;
    vi.stubEnv("TERM", "dumb");

    printBanner("1.2.3", { local: "http://localhost:6280", network: [] });

    expect(logged.join("\n")).not.toMatch(ESCAPE);
  });

  it("colours a terminal, and a pipe when FORCE_COLOR asks", () => {
    process.stdout.isTTY = false;
    vi.stubEnv("FORCE_COLOR", "1");

    printBanner("1.2.3", { local: "http://localhost:6280", network: [] });

    expect(logged.join("\n")).toMatch(ESCAPE);
  });

  it("is one log line with COURIER_LOG_FORMAT=json, and clears nothing", () => {
    process.stdout.isTTY = true;
    vi.stubEnv("COURIER_LOG_FORMAT", "json");
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    printBanner("1.2.3", { local: "http://localhost:6280", network: ["http://192.0.2.10:6280"] });

    expect(logged).toEqual([]);
    expect(written.join("")).toBe("");
    expect(JSON.parse(String(info.mock.calls[0]?.[1]))).toMatchObject({
      message: "Courier Studio v1.2.3 ready at http://localhost:6280, http://192.0.2.10:6280",
    });
  });
});
