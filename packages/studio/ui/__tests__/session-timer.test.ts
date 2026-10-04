/**
 * @vitest-environment jsdom
 *
 * The status bar's session time is the one Studio keeps for the runtimes
 * attached now. A page kept its own copy in the browser, cleared only when
 * that page saw the last runtime leave, so a page opened after Studio or the
 * page had closed counted from a session long over — 285 hours, seconds
 * after Studio started.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const SNAPSHOT = { rows: [], runtimeCount: 1, sourceCount: 1, runtimes: [] };

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
});

describe("the session time a page shows", () => {
  it("counts from when Studio saw the runtimes arrive, whatever the browser kept", async () => {
    localStorage.setItem("courier-studio-v2-session-started", String(Date.now() - 285 * 3_600_000));
    const { useStudioStore } = await import("@/store");

    expect(useStudioStore.getState().sessionStartedAt).toBeNull();

    useStudioStore.getState().setBindingSnapshot({ ...SNAPSHOT, activeSince: 1_791_100_000_000 });

    expect(useStudioStore.getState().sessionStartedAt).toBe(1_791_100_000_000);
  });

  it("stops once the last runtime left", async () => {
    const { useStudioStore } = await import("@/store");
    useStudioStore.getState().setBindingSnapshot({ ...SNAPSHOT, activeSince: 1_791_100_000_000 });

    useStudioStore.getState().setBindingSnapshot({ ...SNAPSHOT, runtimeCount: 0, sourceCount: 0 });

    expect(useStudioStore.getState().sessionStartedAt).toBeNull();
  });
});
