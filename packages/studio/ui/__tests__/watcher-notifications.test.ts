/**
 * `notifyFileChange` announces what the watcher saw change. A change to the
 * API sources is announced by the config's status once it has loaded, so a
 * save that breaks the config is never announced as a reload.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const toastInfo = vi.fn();

vi.mock("sonner", () => ({
  toast: {
    info: (...args: unknown[]) => toastInfo(...args),
  },
}));

import { DEFAULT_SETTINGS } from "../src/store/constants";
import { notifyFileChange } from "../src/store/watcher-notifications";

const announcing = () => ({ settings: DEFAULT_SETTINGS });
const silent = () => ({ settings: { ...DEFAULT_SETTINGS, toastOnFileChange: false } });

beforeEach(() => {
  vi.useFakeTimers();
  toastInfo.mockClear();
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

describe("notifyFileChange", () => {
  it("leaves a change to the API sources to the config's status", () => {
    notifyFileChange("api", ["/project/src/api.ts"], announcing);
    vi.advanceTimersByTime(1_000);

    expect(toastInfo).not.toHaveBeenCalled();
  });

  it("announces a changed mock once the changes settle", () => {
    notifyFileChange("mock", ["petstore"], announcing);
    vi.advanceTimersByTime(1_000);

    expect(toastInfo).toHaveBeenCalledTimes(1);
    expect(toastInfo.mock.calls[0]).toEqual(["Mock server reloaded — petstore"]);
  });

  it("announces rapid mock changes in one toast", () => {
    notifyFileChange("mock", ["petstore"], announcing);
    notifyFileChange("mock", ["billing"], announcing);
    vi.advanceTimersByTime(1_000);

    expect(toastInfo).toHaveBeenCalledTimes(1);
    expect(toastInfo.mock.calls[0]).toEqual(["Mock server reloaded — 2 files"]);
  });

  it("announces nothing while file-change toasts are off", () => {
    notifyFileChange("mock", ["petstore"], silent);
    vi.advanceTimersByTime(1_000);

    expect(toastInfo).not.toHaveBeenCalled();
  });
});
