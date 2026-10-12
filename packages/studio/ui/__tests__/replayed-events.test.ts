/**
 * A replay Studio sends a page is the JSON array its database keeps, in
 * UTF-8: read from the bytes a page's socket hands over, a Node `Buffer`
 * included, and from nothing else.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { replayedEvents } from "@/socket/replayed-events";

const EVENTS = [{ type: "request:start", id: "r1", source: "api", method: "list" }];

afterEach(() => {
  vi.restoreAllMocks();
});

describe("a replay's events", () => {
  it("are read from the bytes a page receives, or from a Node Buffer", () => {
    const text = JSON.stringify(EVENTS);
    const bytes = new TextEncoder().encode(text);

    expect(replayedEvents(bytes.buffer)).toEqual(EVENTS);
    expect(replayedEvents(bytes)).toEqual(EVENTS);
    expect(replayedEvents(Buffer.from(text))).toEqual(EVENTS);
  });

  it("are none for anything but a JSON array in bytes, and a page that cannot read one says so", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(replayedEvents(EVENTS)).toBeUndefined();
    expect(replayedEvents(new TextEncoder().encode('{"type":"request:start"}'))).toBeUndefined();
    expect(replayedEvents(new TextEncoder().encode("[{"))).toBeUndefined();
    expect(replayedEvents(new TextEncoder().encode("[]"))).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
