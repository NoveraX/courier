/**
 * @vitest-environment jsdom
 *
 * An endpoint no mark opens, tried as server code: in Proxy mode the
 * Playground's `not exposed` chip opens on why, and Run as server code
 * switches to Direct mode and runs the call there — nothing more goes to
 * the proxy. The Explorer's Pages row opens the Playground in Direct mode
 * on the endpoint, and sends nothing until the call is sent from there.
 */
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const emit = vi.hoisted(() => vi.fn());

vi.mock("@/socket", () => ({
  getSocket: () => ({ emit, on: vi.fn(), off: vi.fn(), connect: vi.fn() }),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import type { ScannedSource } from "@/features/apis/types";
import { usePlaygroundDrafts } from "@/playground/draft-store";
import { useStudioStore } from "@/store";
import { API, BOUND } from "./playground-fixtures";
import { openShell } from "./shell-harness";

const KEPT = { exposed: false, reason: "nothing marks it .expose()" };

/* The fixture's API, `users.remove` kept to the server and `users.byId` open to a page. */
const SOURCE: ScannedSource = {
  ...API,
  groups: API.groups.map((group) => ({
    ...group,
    endpoints: group.endpoints.map((e) =>
      e.name === "remove"
        ? { ...e, analysis: { ...e.analysis, page: KEPT } }
        : e.name === "byId"
          ? {
              ...e,
              analysis: { ...e.analysis, page: { exposed: true, reason: "marked .expose()" } },
            }
          : e,
    ),
  })),
};

async function settle(interaction: () => void): Promise<void> {
  await act(async () => {
    interaction();
  });
}

function execCalls(): unknown[] {
  return emit.mock.calls
    .filter(([event]) => event === "playground:exec")
    .map(([, payload]) => payload);
}

const request = () => screen.getByRole("region", { name: "Request" });

beforeEach(() => {
  usePlaygroundDrafts.setState({
    variables: { "api.users.remove": '{ "id": 7 }' },
    headers: undefined,
    mode: "proxy",
  });
  useStudioStore.setState({
    connected: true,
    connectionStatus: "connected",
    received: { runtimes: true, requests: true },
    scanSources: [SOURCE],
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
});

describe("the Playground's not exposed chip", () => {
  it("says why the proxy refuses the endpoint, and runs it as server code in Direct mode", async () => {
    await openShell("/playground?endpoint=api.users.remove");

    await settle(() =>
      fireEvent.click(within(request()).getByRole("button", { name: /not exposed/ })),
    );
    const popover = screen.getByRole("dialog", { name: "Not exposed" });
    expect(popover.textContent).toContain(
      "Kept to the server: the proxy refuses a page's call to it — nothing marks it .expose().",
    );
    await settle(() =>
      fireEvent.click(within(popover).getByRole("button", { name: "Run as server code" })),
    );

    expect(execCalls()).toEqual([
      expect.objectContaining({
        source: "api",
        group: "users",
        method: "remove",
        mode: "direct",
        variables: { id: 7 },
      }),
    ]);
    expect(usePlaygroundDrafts.getState().mode).toBe("direct");
    expect(screen.queryByRole("dialog", { name: "Not exposed" })).toBeNull();
    expect(within(request()).queryByText("not exposed")).toBeNull();
  });

  it("is not there for an endpoint a page may call, nor in Direct mode", async () => {
    await openShell("/playground?endpoint=api.users.byId");
    expect(within(request()).queryByText("not exposed")).toBeNull();
    cleanup();

    usePlaygroundDrafts.setState({ mode: "direct" });
    await openShell("/playground?endpoint=api.users.remove");
    expect(within(request()).queryByText("not exposed")).toBeNull();
  });
});

describe("the Explorer's Pages row", () => {
  it("opens an endpoint kept to the server in the Playground in Direct mode, sending nothing", async () => {
    const router = await openShell("/explorer?endpoint=api.users.remove");
    const sheet = screen.getByRole("complementary", { name: "Endpoint" });

    await settle(() =>
      fireEvent.click(within(sheet).getByRole("button", { name: "Try as server code" })),
    );

    expect(router.state.location.pathname).toBe("/playground");
    expect(router.state.location.search).toMatchObject({ endpoint: "api.users.remove" });
    expect(usePlaygroundDrafts.getState().mode).toBe("direct");
    expect(execCalls()).toEqual([]);
  });

  it("offers nothing of the kind for an endpoint a page may call", async () => {
    await openShell("/explorer?endpoint=api.users.byId");
    const sheet = screen.getByRole("complementary", { name: "Endpoint" });

    expect(within(sheet).queryByRole("button", { name: "Try as server code" })).toBeNull();
  });
});
