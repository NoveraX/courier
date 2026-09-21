import { bufferedAnnouncementCount, resetAnnouncements } from "../../core/src/announce/test-support";
import { beforeEach, describe, expect, it } from "vitest";
import {
  announceHosting,
  consumeAnnouncements,
} from "../src/runtime/announce-hosting";

beforeEach(() => {
  resetAnnouncements();
});

describe("announceHosting", () => {
  it("buffers entries before any consumer subscribes", () => {
    announceHosting({ transports: ["http"], sources: [] });
    announceHosting({ transports: ["sse"], sources: [] });
    expect(bufferedAnnouncementCount()).toBe(2);
  });

  it("replays buffered entries to a new consumer synchronously", () => {
    announceHosting({ transports: ["http"], sources: [] });
    const seen: string[] = [];
    consumeAnnouncements((entry) => {
      seen.push(entry.transports.join(","));
    });
    expect(seen).toEqual(["http"]);
  });

  it("delivers future entries to active consumers", () => {
    const seen: string[] = [];
    consumeAnnouncements((entry) => seen.push(entry.transports.join(",")));
    announceHosting({ transports: ["ws"], sources: [] });
    expect(seen).toEqual(["ws"]);
  });

  it("unsubscribe stops further deliveries", () => {
    const seen: string[] = [];
    const unsubscribe = consumeAnnouncements((entry) => seen.push(entry.transports.join(",")));
    announceHosting({ transports: ["http"], sources: [] });
    unsubscribe();
    announceHosting({ transports: ["sse"], sources: [] });
    expect(seen).toEqual(["http"]);
  });
});
