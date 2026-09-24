/**
 * Studio prints its banner by resetting the terminal and clearing the
 * scrollback. Anything reported before that is not scrolled away — it is
 * gone, and a clean banner then reads as a clean start.
 *
 * The reset only ever happens on a terminal, so these tests present stdout as
 * one.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { printBanner } from "../src/server/banner";
import { clearStartupIssues, recordStartupIssue, startupIssues } from "../src/server/startup-issues";

/** The escape sequence that resets the terminal and drops the scrollback. */
const WIPES_HISTORY = "\x1b[3J";

let written: string[];
let logged: string[];
const wasTTY = process.stdout.isTTY;

const URLS = { local: "http://localhost:6280", network: [] };

beforeEach(() => {
  process.stdout.isTTY = true;
  clearStartupIssues();
  written = [];
  logged = [];
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    written.push(String(chunk));
    return true;
  });
  vi.spyOn(console, "log").mockImplementation((...args) => {
    logged.push(args.join(" "));
  });
});

afterEach(() => {
  process.stdout.isTTY = wasTTY;
  vi.restoreAllMocks();
  clearStartupIssues();
});

describe("recording a startup issue", () => {
  it("keeps the summary", () => {
    recordStartupIssue("config did not load");

    expect(startupIssues()).toEqual(["config did not load"]);
  });

  it("appends the reason from an Error", () => {
    recordStartupIssue("config did not load", new Error("key mismatch"));

    expect(startupIssues()[0]).toBe("config did not load: key mismatch");
  });

  it("appends the reason from a thrown value that has no string form", () => {
    recordStartupIssue("courier.mocks.ts did not load", Object.create(null));

    expect(startupIssues()).toEqual(["courier.mocks.ts did not load: [Object: null prototype] {}"]);
  });

  it("keeps every issue in order", () => {
    recordStartupIssue("first");
    recordStartupIssue("second");

    expect(startupIssues()).toEqual(["first", "second"]);
  });
});

describe("the banner on a clean start", () => {
  it("clears the screen", () => {
    printBanner("1.0.0", URLS);

    expect(written.join("")).toContain(WIPES_HISTORY);
  });
});

describe("the banner when something went wrong", () => {
  beforeEach(() => {
    recordStartupIssue("courier.config did not load", new Error("key mismatch"));
  });

  it("leaves the scrollback alone", () => {
    printBanner("1.0.0", URLS);

    expect(written.join("")).not.toContain(WIPES_HISTORY);
  });

  it("restates the problem under the banner", () => {
    printBanner("1.0.0", URLS);

    expect(logged.join("\n")).toContain("courier.config did not load: key mismatch");
  });

  it("still prints the banner itself", () => {
    printBanner("1.0.0", URLS);

    expect(logged.join("\n")).toContain("localhost:6280");
  });
});
