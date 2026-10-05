/**
 * @vitest-environment jsdom
 *
 * A page visiting a public demo — Studio says it serves one, and the page
 * holds no token — is told where it is and when the demo resets, clears
 * only its own page, and is told the demo is resetting rather than broken
 * when it drops on time. The demo's host, holding the token, sees none of
 * it.
 */
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as StudioTokenModule from "@/lib/studio-token";

const emit = vi.fn();
const token = vi.hoisted(() => ({ value: null as string | null }));
const toasts = vi.hoisted(() => ({ error: vi.fn(), warning: vi.fn() }));

vi.mock("sonner", () => ({ toast: toasts }));

vi.mock("@/socket", () => ({ getSocket: () => ({ emit, connect: vi.fn() }) }));
vi.mock("@/socket/socket-instance", () => ({ getSocket: () => ({ emit }) }));
vi.mock("@/lib/studio-token", async (importOriginal) => ({
  ...(await importOriginal<typeof StudioTokenModule>()),
  studioToken: () => token.value,
}));

import { demoResetLine } from "@/features/demo/demo-reset-line";
import { useClearRequests } from "@/hooks/use-clear-requests";
import { clearMockLogs } from "@/mocks/clear-mock-logs";
import { ConnectionBanner } from "@/shell/connection-banner";
import { DemoBanner } from "@/shell/demo-banner";
import { useStudioStore } from "@/store";
import { notifyOnEvents } from "@/store/event-notifications";
import type { StudioInfo } from "@/store/studio-info";

const NOW = Date.UTC(2026, 9, 5, 17, 22);
const INFO: StudioInfo = {
  version: "1.0.0",
  startedAt: NOW - 60_000,
  project: { name: "demo-shop", dependencies: [] },
  demo: { resetsAt: NOW + 37.5 * 60_000 },
};

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
  token.value = null;
  emit.mockClear();
  toasts.error.mockClear();
  toasts.warning.mockClear();
  useStudioStore.setState({ studioInfo: INFO, connectionStatus: "connected", requests: [] });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function ClearButton(): React.ReactNode {
  const clear = useClearRequests();
  return (
    <button type="button" onClick={clear}>
      Clear
    </button>
  );
}

describe("the demo banner", () => {
  it("tells a visitor the project is shared, when it resets, and where to run Studio", () => {
    render(<DemoBanner />);

    const banner = screen.getByRole("complementary", { name: "Live demo" });
    expect(banner.textContent).toContain("Everyone here shares one project");
    expect(banner.textContent).toContain("It resets in 38 min.");
    expect(
      screen.getByRole("link", { name: /Run Studio on your project/ }).getAttribute("href"),
    ).toBe("https://courier.noverax.cloud/studio#setup");
  });

  it("is not shown to the demo's host, nor outside a demo", () => {
    token.value = "t".repeat(43);
    render(<DemoBanner />);
    expect(screen.queryByRole("complementary", { name: "Live demo" })).toBeNull();

    token.value = null;
    act(() => useStudioStore.setState({ studioInfo: { ...INFO, demo: undefined } }));
    expect(screen.queryByRole("complementary", { name: "Live demo" })).toBeNull();
  });

  it("counts down afresh once the demo has reset", () => {
    render(<DemoBanner />);
    vi.setSystemTime(NOW + 10_000);

    act(() =>
      useStudioStore.setState({
        studioInfo: { ...INFO, demo: { resetsAt: NOW + 10_000 + 3.9 * 60_000 } },
      }),
    );

    expect(screen.getByRole("complementary", { name: "Live demo" }).textContent).toContain(
      "It resets in 4 min.",
    );
  });

  it("counts down in whole minutes, rounded up", () => {
    expect(demoResetLine(NOW + 60 * 60_000, NOW)).toBe("It resets in 60 min.");
    expect(demoResetLine(NOW + 30_000, NOW)).toBe("It resets within a minute.");
    expect(demoResetLine(NOW - 1, NOW)).toBe("It is resetting now.");
    expect(demoResetLine(NOW + 3 * 60 * 60_000, NOW)).toBe("It resets in about 3 h.");
    expect(demoResetLine(undefined, NOW)).toBe("It is reset now and then.");
  });
});

describe("a demo that drops", () => {
  it("is resetting when it drops as its reset falls due", () => {
    useStudioStore.setState({
      connectionStatus: "reconnecting",
      studioInfo: { ...INFO, demo: { resetsAt: NOW + 10_000 } },
    });

    render(<ConnectionBanner />);

    expect(screen.getByRole("alert").textContent).toContain("The demo is resetting.");
  });

  it("cannot be reached when it drops long before its reset", () => {
    useStudioStore.setState({ connectionStatus: "reconnecting" });

    render(<ConnectionBanner />);

    expect(screen.getByRole("alert").textContent).toContain("Studio cannot be reached.");
  });
});

describe("a visitor's clear", () => {
  it("clears the visitor's page and asks Studio for nothing", () => {
    render(<ClearButton />);

    act(() => screen.getByRole("button", { name: "Clear" }).click());
    clearMockLogs("shop");

    expect(emit).not.toHaveBeenCalled();
  });

  it("is sent on for the demo's host", () => {
    token.value = "t".repeat(43);
    render(<ClearButton />);

    act(() => screen.getByRole("button", { name: "Clear" }).click());
    clearMockLogs("shop");

    expect(emit).toHaveBeenCalledWith("requests:clear", { keep: [] });
    expect(emit).toHaveBeenCalledWith("mock:logs:clear", { serverId: "shop" });
  });
});

describe("the shared traffic", () => {
  const traffic = [
    { type: "request:error", requestId: "r1", method: "place" },
    { type: "request:end", requestId: "r2", method: "create", timing: { total: 4_000 } },
  ];

  it("is not toasted to a visitor", () => {
    notifyOnEvents(traffic, useStudioStore.getState);

    expect(toasts.error).not.toHaveBeenCalled();
    expect(toasts.warning).not.toHaveBeenCalled();
  });

  it("is toasted to the demo's host, as Studio's settings say", () => {
    token.value = "t".repeat(43);

    notifyOnEvents(traffic, useStudioStore.getState);

    expect(toasts.error).toHaveBeenCalledWith("Request failed: place");
    expect(toasts.error).toHaveBeenCalledWith("Slow request: create (4000ms)");
  });
});
