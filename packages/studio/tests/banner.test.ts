/**
 * What the startup banner writes.
 *
 * Its title row was two columns wider than the box, and it reset the terminal
 * and wrote colour codes into pipes and log files, ignoring NO_COLOR.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { printBanner, wantsColour } from "../src/server/banner";
import { clearStartupIssues } from "../src/server/startup-issues";

// biome-ignore lint/suspicious/noControlCharactersInRegex: it matches the ESC that starts a terminal colour
const ESCAPE = /\x1b\[[\d;]*m/g;

let logged: string[];
let written: string[];
const wasTTY = process.stdout.isTTY;

beforeEach(() => {
  clearStartupIssues();
  logged = [];
  written = [];
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

const boxRows = () =>
  logged
    .join("\n")
    .split("\n")
    .map((line) => line.replace(ESCAPE, ""))
    .filter((line) => line.trim().length > 0);

describe("printBanner", () => {
  it("keeps every row inside the box", () => {
    process.stdout.isTTY = true;
    printBanner("1.2.3", { local: "http://localhost:6280", network: ["http://192.0.2.10:6280"] });

    const widths = new Set(boxRows().map((line) => [...line].length));
    expect(widths.size).toBe(1);
  });

  it("prints the version and each address", () => {
    printBanner("1.2.3", {
      local: "http://localhost:6280",
      network: ["http://[2001:db8::5]:6280"],
    });

    const text = boxRows().join("\n");
    expect(text).toContain("v1.2.3");
    expect(text).toContain("Local     http://localhost:6280");
    expect(text).toContain("Network   http://[2001:db8::5]:6280");
  });

  it("says a page opened without the links' token can only look", () => {
    printBanner("1.2.3", { local: "http://localhost:6280/#token=k3y", network: [] });

    expect(boxRows().join("\n")).toContain(
      "Open a link above: without its token a page can only look.",
    );
  });

  it("prints no network row when Studio is not on the network", () => {
    printBanner("1.2.3", { local: "http://localhost:6280", network: [] });

    expect(boxRows().join("\n")).not.toContain("Network");
  });

  it("writes neither a reset nor colour into a pipe", () => {
    process.stdout.isTTY = false;
    printBanner("1.2.3", { local: "http://localhost:6280", network: [] });

    expect(written.join("")).toBe("");
    expect(logged.join("\n")).not.toMatch(ESCAPE);
  });
});

describe("wantsColour", () => {
  it("follows the terminal, then NO_COLOR, then FORCE_COLOR", () => {
    expect(wantsColour({ isTTY: true }, {})).toBe(true);
    expect(wantsColour({ isTTY: false }, {})).toBe(false);
    expect(wantsColour({ isTTY: true }, { NO_COLOR: "1" })).toBe(false);
    expect(wantsColour({ isTTY: false }, { FORCE_COLOR: "1" })).toBe(true);
  });
});
