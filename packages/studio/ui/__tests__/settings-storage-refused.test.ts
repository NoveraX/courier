/**
 * @vitest-environment jsdom
 *
 * Settings in a browser that refuses the page's storage — a sandboxed frame,
 * blocked site data, a full quota: every change still applies, for this page
 * only, the settings start from the defaults, and the console says once that
 * nothing is kept.
 */
import type { MockInstance } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let warn: MockInstance<typeof console.warn>;

function refuseStorage(): void {
  const refusal = new DOMException("The operation is insecure.", "SecurityError");
  const refuse = (): never => {
    throw refusal;
  };
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(refuse);
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(refuse);
  vi.spyOn(Storage.prototype, "removeItem").mockImplementation(refuse);
}

beforeEach(() => {
  vi.resetModules();
  warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  refuseStorage();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("settings where the browser refuses storage", () => {
  it("apply a change all the same", async () => {
    const { useStudioStore } = await import("@/store");

    useStudioStore.getState().updateSettings({ preserveLog: true });
    useStudioStore.getState().togglePreserveLog();
    useStudioStore.getState().setTheme("light");

    expect(useStudioStore.getState().settings.preserveLog).toBe(false);
    expect(useStudioStore.getState().theme).toBe("light");
  });

  it("start from the defaults", async () => {
    const { DEFAULT_SETTINGS, loadSettings } = await import("@/store/constants");

    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("say once that nothing is kept, however many changes are made", async () => {
    const { useStudioStore } = await import("@/store");

    useStudioStore.getState().updateSettings({ preserveLog: true });
    useStudioStore.getState().resetSettings();

    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0]?.[0])).toContain("refuses Studio's storage");
  });
});
