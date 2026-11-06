/**
 * @vitest-environment jsdom
 *
 * Add to mock, from a mock's routes: the endpoints a mock leaves to its
 * source's server are named above its routes, with the action that adds
 * them all, and a route the server answers offers the same for itself. The
 * change is previewed as a diff and made only as previewed; a mock Studio
 * does not manage offers none of it.
 */
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const post = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api-client", () => ({ post, get: vi.fn(), apiClient: { post } }));
vi.mock("@/socket", () => ({
  getSocket: () => ({
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    connect: vi.fn(),
    timeout: () => ({ emit: vi.fn() }),
  }),
}));

import { useStudioStore } from "@/store";
import type { MockRouteEntry } from "@/store/mock-slice";
import { useMockStore } from "@/store/mock-slice";
import { mockServer } from "./mock-server-fixture";
import { openShell } from "./shell-harness";

function route(endpoint: string, source: MockRouteEntry["source"]): MockRouteEntry {
  return {
    group: "orders",
    endpoint,
    httpMethod: "post",
    path: endpoint,
    fullPath: `/orders/${endpoint}`,
    source,
    hits: 0,
    avgLatency: 0,
  };
}

const READY = {
  status: "ready",
  target: "courier.mocks.ts",
  creates: false,
  baseHash: "a".repeat(64),
  planDigest: "b".repeat(64),
  hunks: [
    {
      lines: [
        {
          kind: "remove",
          text: '  shop: defineMockServer({ endpoints: ["orders.list"] }),',
          oldLine: 5,
          newLine: null,
        },
        {
          kind: "add",
          text: '  shop: defineMockServer({ endpoints: ["orders.list", "orders.refund"] }),',
          oldLine: null,
          newLine: 5,
        },
      ],
    },
  ],
  warnings: [],
};

async function settle(interaction: () => void): Promise<void> {
  await act(async () => {
    interaction();
  });
}

beforeEach(() => {
  post.mockReset();
  useStudioStore.setState({
    connected: true,
    connectionStatus: "connected",
    requests: [],
    heldRequests: [],
  });
  useMockStore.setState({
    servers: {
      shop: mockServer({
        serverId: "shop",
        name: "shop",
        source: "shop",
        routes: [route("list", "auto"), route("refund", "upstream"), route("void", "upstream")],
      }),
    },
    activeServerId: "shop",
    logs: [],
  });
});

afterEach(cleanup);

describe("Add to mock, from a mock's routes", () => {
  it("names the endpoints its server answers, and adds them all as previewed", async () => {
    post.mockResolvedValueOnce(READY).mockResolvedValueOnce({
      status: "applied",
      target: "courier.mocks.ts",
      keys: ["shop"],
      warnings: [],
    });
    await openShell("/mocks/routes");

    expect(screen.getByText(/2 endpoints of shop go to your server/)).toBeTruthy();
    await settle(() => fireEvent.click(screen.getByRole("button", { name: "Add to mock" })));

    expect(post).toHaveBeenCalledWith("/api/mocks/endpoints/preview", {
      key: "shop",
      endpoints: ["orders.refund", "orders.void"],
    });
    expect(await screen.findByText(/"orders.list", "orders.refund"/)).toBeTruthy();
    const dialog = screen.getByRole("dialog");
    await settle(() =>
      fireEvent.click(
        [...dialog.querySelectorAll("button")].find(
          (b) => b.textContent === "Add to mock",
        ) as HTMLElement,
      ),
    );

    expect(post).toHaveBeenLastCalledWith("/api/mocks/endpoints/apply", {
      key: "shop",
      endpoints: ["orders.refund", "orders.void"],
      baseHash: READY.baseHash,
      planDigest: READY.planDigest,
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("adds one route its server answers from the route itself", async () => {
    post.mockResolvedValueOnce(READY);
    await openShell("/mocks/routes");

    await settle(() => fireEvent.click(screen.getByText("/orders/refund")));
    const buttons = screen.getAllByRole("button", { name: "Add to mock" });
    await settle(() => fireEvent.click(buttons.at(-1) as HTMLElement));

    expect(post).toHaveBeenCalledWith("/api/mocks/endpoints/preview", {
      key: "shop",
      endpoints: ["orders.refund"],
    });
  });

  it("offers nothing for a mock Studio does not manage", async () => {
    useMockStore.setState({
      servers: {
        shop: mockServer({
          serverId: "shop",
          name: "shop",
          managed: false,
          origin: "external",
          routes: [route("refund", "upstream")],
        }),
      },
      activeServerId: "shop",
    });
    await openShell("/mocks/routes");

    expect(screen.queryByRole("button", { name: "Add to mock" })).toBeNull();
  });
});
