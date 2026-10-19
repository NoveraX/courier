/**
 * @vitest-environment jsdom
 *
 * The Playground on a phone: one pane at a time under a switch — the
 * response shown once a call is sent and marked with how it went, the
 * request again once another endpoint is chosen — Prettify and Reset in
 * the request's title, and an invitation to send that names no keys.
 */
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const emit = vi.hoisted(() => vi.fn());

vi.mock("@/socket", () => ({
  getSocket: () => ({ emit, on: vi.fn(), off: vi.fn(), connect: vi.fn() }),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { MEDIA } from "@/design/breakpoints";
import { usePlaygroundDrafts } from "@/playground/draft-store";
import { useStudioStore } from "@/store";
import { API, BOUND } from "./playground-fixtures";
import { requestEntry } from "./request-entry-fixture";
import { openShell } from "./shell-harness";

const PHONE = new Set<string>([MEDIA.phone, MEDIA.compactShell, MEDIA.coarse]);

async function settle(interaction: () => void): Promise<void> {
  await act(async () => {
    interaction();
  });
}

const panes = () => screen.getByRole("group", { name: "Pane" });
const pressed = (name: RegExp) =>
  within(panes()).getByRole("button", { name }).getAttribute("aria-pressed");

beforeEach(() => {
  vi.stubGlobal("matchMedia", (media: string) => ({
    media,
    matches: PHONE.has(media),
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
  }));
  usePlaygroundDrafts.setState({ variables: {}, headers: undefined, mode: "direct" });
  useStudioStore.setState({
    connected: true,
    connectionStatus: "connected",
    received: { runtimes: true, requests: true },
    scanSources: [API],
    bindingSnapshot: BOUND,
    requests: [],
    heldRequests: [],
    playgroundHistory: [],
    playgroundActiveResponse: null,
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("the Playground on a phone", () => {
  it("shows the request first, and invites a send without naming keys", async () => {
    await openShell("/playground?endpoint=api.users.create");

    expect(pressed(/^Request/)).toBe("true");
    expect(pressed(/^Response/)).toBe("false");
    expect(screen.getByText("Use the Send button")).toBeTruthy();
    expect(screen.queryByText(/Press/)).toBeNull();
  });

  it("shows the response once a call is sent, marked with its status as it comes", async () => {
    await openShell("/playground?endpoint=api.users.create");

    await settle(() => fireEvent.click(screen.getByRole("button", { name: /^Send/ })));

    expect(pressed(/^Response/)).toBe("true");
    expect(within(panes()).getByRole("button", { name: /^Response/ }).textContent).toBe(
      "Response···",
    );
    const rid = useStudioStore.getState().playgroundHistory[0]?.rid ?? "";
    await settle(() => {
      const store = useStudioStore.getState();
      store.appendPlaygroundChunk(rid, { kind: "http-result", status: 201, data: { id: 7 } });
      store.endPlayground(rid, { durationMs: 40 });
      useStudioStore.setState({
        requests: [
          requestEntry({ id: `pg_${rid}`, group: "users", method: "create", statusCode: 201 }),
        ],
      });
    });
    expect(within(panes()).getByRole("button", { name: /^Response/ }).textContent).toBe(
      "Response201",
    );
  });

  it("goes back to the request when another endpoint is chosen", async () => {
    await openShell("/playground?endpoint=api.users.create");
    await settle(() => fireEvent.click(screen.getByRole("button", { name: /^Send/ })));
    expect(pressed(/^Response/)).toBe("true");

    await settle(() => fireEvent.click(screen.getByRole("button", { name: /^Endpoint:/ })));
    await settle(() => fireEvent.click(screen.getByRole("option", { name: /search/ })));

    expect(screen.getByRole("button", { name: "Endpoint: api.users.search" })).toBeTruthy();
    expect(pressed(/^Request/)).toBe("true");
  });

  it("puts Prettify and Reset in the request's title", async () => {
    await openShell("/playground?endpoint=api.users.create");

    const title = screen.getByRole("heading", { name: "Request" }).parentElement;
    expect(title && within(title).getByRole("button", { name: "Prettify" })).toBeTruthy();
    expect(title && within(title).getByRole("button", { name: "Reset" })).toBeTruthy();
  });
});
