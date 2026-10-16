import { afterEach, describe, expect, it, vi } from "vitest";
import { announceHosting, announceWhenRegistered, consumeAnnouncements } from "../src/announce";
import { bufferedAnnouncementCount, resetAnnouncements } from "../src/announce/test-support";
import { setAppOrigin } from "../src/app-origin";
import { defineApi } from "../src/define";
import { _resetSourcesForTests, registerSources } from "../src/sources";

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

describe("announceWhenRegistered", () => {
  afterEach(() => {
    _resetSourcesForTests();
  });

  it("waits, without throwing, until sources are registered", () => {
    _resetSourcesForTests();
    const announce = announceWhenRegistered({ transports: ["http"], framework: "hono" });

    expect(() => announce()).not.toThrow();
    expect(bufferedAnnouncementCount()).toBe(0);
  });

  it("announces the registered sources on the first call that finds them", () => {
    _resetSourcesForTests();
    const announce = announceWhenRegistered({ transports: ["ws"], framework: "express" });
    announce();
    registerSources({ api: fakeApi });
    const listener = vi.fn();
    consumeAnnouncements(listener);

    announce();

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ transports: ["ws"], framework: "express", sources: [fakeApi] }),
    );
  });

  it("announces as soon as sources are registered, before any request", () => {
    _resetSourcesForTests();
    const listener = vi.fn();
    consumeAnnouncements(listener);
    announceWhenRegistered({ transports: ["http"], framework: "express" });

    registerSources({ api: fakeApi });

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ transports: ["http"], framework: "express", sources: [fakeApi] }),
    );
  });

  it("announces at once when the sources are already registered", () => {
    registerSources({ api: fakeApi });
    const listener = vi.fn();
    consumeAnnouncements(listener);

    announceWhenRegistered({ transports: ["sse"] });

    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ transports: ["sse"] }));
  });

  it("announces again with the app's origin once the server's own address brings it, and then no more", () => {
    vi.stubEnv("NODE_ENV", "development");
    registerSources({ api: fakeApi });
    const announce = announceWhenRegistered({ transports: ["http"], framework: "next" });
    const listener = vi.fn();
    consumeAnnouncements(listener);

    announce();
    announce({ serverOrigin: "http://localhost:3000" });
    announce({ serverOrigin: "http://localhost:3000" });

    expect(listener.mock.calls.map(([entry]) => entry.listenOrigin)).toEqual([
      undefined,
      "http://localhost:3000",
    ]);
    setAppOrigin(undefined);
    vi.unstubAllEnvs();
  });

  it("takes from an older adapter's Host origin only this machine's own names", () => {
    vi.stubEnv("NODE_ENV", "development");
    registerSources({ api: fakeApi });
    const announce = announceWhenRegistered({ transports: ["http"], framework: "express" });
    const listener = vi.fn();
    consumeAnnouncements(listener);

    announce("http://evil.example:3000");
    announce("http://localhost:3000");

    expect(listener.mock.calls.map(([entry]) => entry.listenOrigin)).toEqual([
      undefined,
      "http://localhost:3000",
    ]);
    setAppOrigin(undefined);
    vi.unstubAllEnvs();
  });

  it("announces the origin the config gives at once", () => {
    setAppOrigin("https://app.example.com");
    registerSources({ api: fakeApi });
    const listener = vi.fn();
    consumeAnnouncements(listener);

    announceWhenRegistered({ transports: ["sse"] })();

    expect(listener.mock.calls.map(([entry]) => entry.listenOrigin)).toEqual([
      "https://app.example.com",
    ]);
    setAppOrigin(undefined);
  });

  it("announces once", () => {
    registerSources({ api: fakeApi });
    const announce = announceWhenRegistered({ transports: ["http"] });

    announce();
    announce();

    expect(bufferedAnnouncementCount()).toBe(1);
  });
});
