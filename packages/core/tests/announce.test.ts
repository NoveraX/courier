import { bufferedAnnouncementCount, resetAnnouncements } from "../src/announce/test-support";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  announceHosting,
  consumeAnnouncements,
} from "../src/announce";
import { defineApi } from "../src/define";

const fakeApi = defineApi({ baseURL: "http://example.com", groups: {} });

afterEach(() => {
  resetAnnouncements();
});

describe("announceHosting", () => {
  it("buffers entries until a consumer subscribes", () => {
    announceHosting({ transports: ["http"], sources: [fakeApi] });
    expect(bufferedAnnouncementCount()).toBe(1);
  });

  it("preserves listenOrigin when supplied", () => {
    announceHosting({
      transports: ["http"],
      sources: [fakeApi],
      listenOrigin: "http://localhost:3000",
    });
    const listener = vi.fn();
    consumeAnnouncements(listener);
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ listenOrigin: "http://localhost:3000" }),
    );
  });

  it("preserves framework brand when supplied", () => {
    announceHosting({
      transports: ["sse"],
      sources: [fakeApi],
      framework: "next",
    });
    const listener = vi.fn();
    consumeAnnouncements(listener);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ framework: "next" }));
  });

  it("omits listenOrigin/framework keys when not supplied", () => {
    announceHosting({ transports: ["ws"], sources: [fakeApi] });
    const listener = vi.fn();
    consumeAnnouncements(listener);
    const entry = listener.mock.calls[0]?.[0];
    expect(entry?.listenOrigin).toBeUndefined();
    expect(entry?.framework).toBeUndefined();
  });
});

describe("consumeAnnouncements", () => {
  it("replays buffered entries synchronously to a fresh listener", () => {
    announceHosting({ transports: ["http"], sources: [fakeApi] });
    announceHosting({ transports: ["sse"], sources: [fakeApi] });
    const listener = vi.fn();
    consumeAnnouncements(listener);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("delivers future entries to the listener after subscribe", () => {
    const listener = vi.fn();
    consumeAnnouncements(listener);
    announceHosting({ transports: ["ws"], sources: [fakeApi] });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("returns an unsubscribe handle that stops further deliveries", () => {
    const listener = vi.fn();
    const unsubscribe = consumeAnnouncements(listener);
    unsubscribe();
    announceHosting({ transports: ["http"], sources: [fakeApi] });
    expect(listener).not.toHaveBeenCalled();
  });

  it("supports multiple concurrent listeners", () => {
    const a = vi.fn();
    const b = vi.fn();
    consumeAnnouncements(a);
    consumeAnnouncements(b);
    announceHosting({ transports: ["http"], sources: [fakeApi] });
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });
});
