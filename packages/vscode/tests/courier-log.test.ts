/**
 * Courier's log: a failure written as a warning once, and at the trace
 * level while the same failure comes again — a Studio asked every few
 * seconds while it is down does not flood it — and a failure handler that
 * logs and answers with what stands in for the result.
 */
import { afterEach, describe, expect, it } from "vitest";

import { closeCourierLog, logFailure, loggedAs } from "../src/log/courier-log";
import { logged } from "./vscode-stand-in";

afterEach(() => {
  closeCourierLog();
  logged.length = 0;
});

describe("Courier's log", () => {
  it("warns of a failure once, and traces it while it comes again, warning of a new one", () => {
    logFailure(
      "Studio at http://localhost:6280 did not list its requests",
      new Error("fetch failed"),
    );
    logFailure(
      "Studio at http://localhost:6280 did not list its requests",
      new Error("fetch failed"),
    );
    logFailure("Studio at http://localhost:6280 did not list its requests", new Error("HTTP 500"));

    expect(logged).toEqual([
      ["warn", "Studio at http://localhost:6280 did not list its requests: fetch failed"],
      ["trace", "Studio at http://localhost:6280 did not list its requests: fetch failed"],
      ["warn", "Studio at http://localhost:6280 did not list its requests: HTTP 500"],
    ]);
  });

  it("answers a failure with what stands in for the result, logging it", async () => {
    const sites = await Promise.reject(new Error("socket hang up")).catch(
      loggedAs("Studio did not list the call sites", []),
    );

    expect(sites).toEqual([]);
    expect(logged).toEqual([["warn", "Studio did not list the call sites: socket hang up"]]);
  });
});
