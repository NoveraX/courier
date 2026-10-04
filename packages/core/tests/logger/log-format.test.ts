/**
 * COURIER_LOG_FORMAT: text unless it says json, in any case and with any
 * surrounding space; any other value keeps text and is handed back.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { readLogFormat } from "../../src/logger/log-format";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("readLogFormat", () => {
  it("is text when unset, empty or text", () => {
    for (const value of [undefined, "", "  ", "text", "TEXT"]) {
      vi.stubEnv("COURIER_LOG_FORMAT", value);
      expect(readLogFormat()).toEqual({ json: false });
    }
  });

  it("is json in any case", () => {
    vi.stubEnv("COURIER_LOG_FORMAT", " JSON ");

    expect(readLogFormat()).toEqual({ json: true });
  });

  it("keeps text for a value it does not know, and hands that value back", () => {
    vi.stubEnv("COURIER_LOG_FORMAT", "logfmt");

    expect(readLogFormat()).toEqual({ json: false, unrecognised: "logfmt" });
  });
});
