/**
 * @vitest-environment jsdom
 *
 * Settings on the new shell: a change marked "edited", dotted in the
 * navigation and counted in the bar until Save keeps it — in this browser,
 * where Import reads the API defaults — or Discard drops it; a theme shown
 * as soon as it is picked; an ignore pattern that is not
 * a regular expression refused with the reason; a setting saved elsewhere
 * followed; the saved sessions with a delete that asks; the captured
 * requests cleared after asking; and, on a window too narrow for the side
 * list, the title heading the page over a row of section chips.
 */
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/socket", () => ({
  getSocket: () => ({ emit: vi.fn(), on: vi.fn(), off: vi.fn(), connect: vi.fn() }),
}));
vi.mock("@/socket/socket-instance", () => ({ getSocket: () => ({ emit: vi.fn() }) }));
vi.mock("@/lib/api-client", () => ({ post: vi.fn(), get: vi.fn(), apiClient: { post: vi.fn() } }));

import { buildDefaultOptions } from "@/features/apis/helpers";
import { post } from "@/lib/api-client";
import { useStudioStore } from "@/store";
import { DEFAULT_SETTINGS, SETTINGS_STORAGE_KEY } from "@/store/constants";
import { requestEntry } from "./request-entry-fixture";
import { openShell } from "./shell-harness";

const SESSION = {
  id: "s1",
  name: "Checkout bug",
  savedAt: Date.now() - 3_600_000,
  startedAt: Date.now() - 7_200_000,
  duration: 60_000,
  stats: { totalRequests: 42, successCount: 40, errorCount: 2, avgDuration: 80, totalSize: 4096 },
  appCount: 1,
};

async function settle(interaction: () => void): Promise<void> {
  await act(async () => {
    interaction();
  });
}

const section = (name: string) => within(screen.getByRole("region", { name }));

beforeEach(() => {
  vi.mocked(post).mockImplementation(async (url: string) =>
    url === "/api/sessions/list" ? [SESSION] : {},
  );
  useStudioStore.setState({
    connected: true,
    connectionStatus: "connected",
    settings: DEFAULT_SETTINGS,
    requests: [requestEntry({ id: "a" }), requestEntry({ id: "b" })],
    heldRequests: [],
  });
  document.documentElement.removeAttribute("data-theme");
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

/* A window narrower than the 860 pixels the side list needs: only that query matches. */
function narrowWindow(): void {
  vi.stubGlobal("matchMedia", (media: string) => ({
    media,
    matches: media === "(max-width: 859px)",
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

describe("Settings", () => {
  it("marks a change, counts it in the bar, and keeps it on Save", async () => {
    await openShell("/settings");

    await settle(() =>
      fireEvent.click(section("Display").getByRole("button", { name: "4 spaces" })),
    );

    expect(section("Display").getByText("edited")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Display.*unsaved changes/ })).toBeTruthy();
    expect(screen.getByText("1 unsaved change")).toBeTruthy();
    await settle(() => fireEvent.click(screen.getByRole("button", { name: "Save changes" })));
    expect(useStudioStore.getState().settings.jsonIndent).toBe(4);
    expect(screen.queryByText("1 unsaved change")).toBeNull();
  });

  it("keeps a save in this browser, applies its theme, and hands the API defaults to Import", async () => {
    localStorage.clear();
    await openShell("/settings");

    await settle(() =>
      fireEvent.click(section("Appearance").getByRole("button", { name: "Light" })),
    );
    await settle(() =>
      fireEvent.click(section("API defaults").getByRole("switch", { name: "Include comments" })),
    );
    await settle(() => fireEvent.click(screen.getByRole("button", { name: "Save changes" })));

    const state = useStudioStore.getState();
    const stored: unknown = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) ?? "null");
    expect(state.settings).toMatchObject({ theme: "light", apisIncludeComments: false });
    expect(stored).toMatchObject({ theme: "light", apisIncludeComments: false });
    expect(state.theme).toBe("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(buildDefaultOptions("pets", state.settings).includeComments).toBe(false);
  });

  it("shows a theme at once, and puts the saved one back on Discard", async () => {
    await openShell("/settings");

    await settle(() =>
      fireEvent.click(section("Appearance").getByRole("button", { name: "Light" })),
    );
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(useStudioStore.getState().settings.theme).toBe("dark");

    await settle(() => fireEvent.click(screen.getByRole("button", { name: "Discard" })));
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });

  it("refuses an ignore pattern that is not a regular expression, and adds one that is", async () => {
    await openShell("/settings");
    const field = screen.getByRole("textbox", { name: "Ignore pattern to add" });

    await settle(() => fireEvent.change(field, { target: { value: "*.png" } }));
    await settle(() => fireEvent.click(section("Recording").getByRole("button", { name: "Add" })));
    expect(screen.getByRole("alert").textContent).toBe(
      "Not a regular expression: Nothing to repeat",
    );

    await settle(() => fireEvent.change(field, { target: { value: "\\.png$" } }));
    await settle(() => fireEvent.keyDown(field, { key: "Enter" }));
    expect(screen.getByRole("list", { name: "Ignore patterns" }).textContent).toContain("\\.png$");
  });

  it("follows a setting saved elsewhere while keeping the ones edited here", async () => {
    await openShell("/settings");
    await settle(() =>
      fireEvent.click(section("Display").getByRole("button", { name: "4 spaces" })),
    );

    await settle(() => useStudioStore.getState().updateSettings({ slowRequestThreshold: 2000 }));

    expect(
      section("Notifications").getByRole("button", { name: "2s" }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(screen.getByText("1 unsaved change")).toBeTruthy();
  });

  it("lists the saved sessions, and deletes one after asking", async () => {
    await openShell("/settings");

    const saved = within(screen.getByRole("list", { name: "Saved sessions" }));
    expect(saved.getByText("Checkout bug")).toBeTruthy();
    expect(saved.getByText("2 errors")).toBeTruthy();
    await settle(() => fireEvent.click(saved.getByRole("button", { name: "Delete Checkout bug" })));
    await settle(() => fireEvent.click(saved.getByRole("button", { name: "Delete session" })));

    expect(vi.mocked(post)).toHaveBeenCalledWith("/api/sessions/delete", { id: "s1" });
  });

  it("heads a narrow window's page with its title, over a row of the sections as chips", async () => {
    narrowWindow();
    await openShell("/settings");

    const nav = within(screen.getByRole("navigation", { name: "Settings sections" }));
    expect(screen.getByRole("heading", { name: "Settings" })).toBeTruthy();
    expect(nav.queryByRole("heading", { name: "Settings" })).toBeNull();
    expect(nav.getAllByRole("link").map((link) => link.textContent)).toEqual([
      "Appearance",
      "Connection",
      "Editor",
      "Recording",
      "Display",
      "Notifications",
      "Export",
      "API defaults",
      "Session history",
      "Storage",
      "Danger zone",
    ]);
    expect(nav.getByRole("link", { name: "Appearance" }).getAttribute("aria-current")).toBe(
      "location",
    );

    await settle(() =>
      fireEvent.click(section("Display").getByRole("button", { name: "4 spaces" })),
    );
    expect(nav.getByRole("link", { name: /Display.*unsaved changes/ })).toBeTruthy();
  });

  it("clears the captured requests after asking", async () => {
    await openShell("/settings");

    await settle(() =>
      fireEvent.click(section("Danger zone").getByRole("button", { name: "Clear" })),
    );
    expect(screen.getByRole("alertdialog", { name: "Delete 2 captured requests?" })).toBeTruthy();
    await settle(() => fireEvent.click(screen.getByRole("button", { name: "Delete requests" })));

    expect(useStudioStore.getState().requests).toHaveLength(0);
  });
});
