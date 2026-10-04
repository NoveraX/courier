import { afterEach, describe, expect, it, vi } from "vitest";

import { pollsEverywhere } from "../src/server/watch-polling-setting";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("pollsEverywhere", () => {
  it.each(["1", "true", "on", "TRUE", " On "])("asks for it with %j", (value) => {
    expect(pollsEverywhere({ COURIER_WATCH_POLLING: value })).toBe(true);
  });

  it.each([undefined, "", "0", "false", "off", "OFF"])("leaves it to Studio with %j", (value) => {
    expect(pollsEverywhere({ COURIER_WATCH_POLLING: value })).toBe(false);
  });

  it("leaves it to Studio for a value it does not know, and says so once", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(pollsEverywhere({ COURIER_WATCH_POLLING: "sometimes" })).toBe(false);
    pollsEverywhere({ COURIER_WATCH_POLLING: "sometimes" });

    const said = warn.mock.calls.filter((call) => String(call[1]).includes('"sometimes"'));
    expect(said).toHaveLength(1);
  });
});
