/**
 * @vitest-environment jsdom
 *
 * The page's resume signals: one set of listeners for every connection on
 * the page, added with the first and removed with the last, and signals
 * that come together told once.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { onResume, type ResumeSignal } from "../src/realtime/resume-signals";

const stops: (() => void)[] = [];

function listen(): ResumeSignal[] {
  const heard: ResumeSignal[] = [];
  stops.push(onResume((signal) => heard.push(signal)));
  return heard;
}

function show(): void {
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  for (const stop of stops.splice(0)) stop();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("the page's resume signals", () => {
  it("are heard when the network comes back", () => {
    const heard = listen();

    window.dispatchEvent(new Event("online"));

    expect(heard).toEqual(["online"]);
  });

  it("are heard when the page is shown again, not when it is hidden", () => {
    const heard = listen();
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));

    show();

    expect(heard).toEqual(["visible"]);
  });

  it("are heard when a page comes back from the back/forward cache, not when it loads", () => {
    const heard = listen();
    window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: false }));

    window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true }));

    expect(heard).toEqual(["pageshow"]);
  });

  it("are heard when the window gets focus", () => {
    const heard = listen();

    window.dispatchEvent(new Event("focus"));

    expect(heard).toEqual(["focus"]);
  });

  it("are told once when they come together, as bringing a tab back fires several", () => {
    const heard = listen();

    show();
    window.dispatchEvent(new Event("focus"));
    vi.advanceTimersByTime(999);
    window.dispatchEvent(new Event("online"));
    vi.advanceTimersByTime(1);
    window.dispatchEvent(new Event("online"));

    expect(heard).toEqual(["visible", "online"]);
  });

  it("reach every listener", () => {
    const first = listen();
    const second = listen();

    window.dispatchEvent(new Event("online"));

    expect([first, second]).toEqual([["online"], ["online"]]);
  });

  it("are listened to on the page once for every listener, and not at all once the last stops", () => {
    const added = vi.spyOn(window, "addEventListener");
    const removed = vi.spyOn(window, "removeEventListener");
    const addedOnDocument = vi.spyOn(document, "addEventListener");
    const removedOnDocument = vi.spyOn(document, "removeEventListener");

    const ours = Array.from({ length: 100 }, () => onResume(() => undefined));
    const listening = added.mock.calls.length + addedOnDocument.mock.calls.length;
    for (const stop of ours) stop();

    expect(listening).toBe(4);
    expect(removed.mock.calls.length + removedOnDocument.mock.calls.length).toBe(4);
    expect(removed.mock.calls.map(([type]) => type).sort()).toEqual(
      added.mock.calls.map(([type]) => type).sort(),
    );
  });

  it("reach nobody once their listener stopped", () => {
    const heard: ResumeSignal[] = [];
    const stop = onResume((signal) => heard.push(signal));
    stop();
    stop();

    window.dispatchEvent(new Event("online"));

    expect(heard).toEqual([]);
  });
});
