/**
 * The reason a managed mock did not start, as Studio is told it: a port in
 * use in those words and coded, so Studio can move a mock whose port it
 * assigned; any other failure by its message.
 */
import { describe, expect, it, vi } from "vitest";
import { startFailure } from "../../src/managed/start-failure";

describe("the reason a mock did not start", () => {
  it("says a port in use in those words, coded", () => {
    const error = Object.assign(new Error("listen EADDRINUSE"), { code: "EADDRINUSE", port: 7001 });

    expect(startFailure(error)).toEqual({
      message: "Port 7001 is in use by another process.",
      code: "PORT_IN_USE",
    });
  });

  it("gives any other failure by its message, with no code", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(startFailure(new Error("Cannot find package 'hono'"))).toEqual({
      message: "Cannot find package 'hono'",
    });
    vi.restoreAllMocks();
  });
});
