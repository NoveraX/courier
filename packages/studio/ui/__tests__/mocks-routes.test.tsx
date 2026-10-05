/**
 * @vitest-environment jsdom
 *
 * The mock's routes: counted and narrowed by what answers them, searched by
 * path or endpoint, and opened for what answers a route, how to call it,
 * the shape of its answers and a sample — all kept in the address.
 */
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/socket", () => ({
  getSocket: () => ({
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    connect: vi.fn(),
    timeout: () => ({ emit: vi.fn() }),
  }),
}));

import {
  filterRoutes,
  routeKindCounts,
  validateMockRoutesSearch,
} from "@/features/mocks/routes-view";
import { useStudioStore } from "@/store";
import type { MockRouteEntry } from "@/store/mock-slice";
import { useMockStore } from "@/store/mock-slice";
import { mockServer } from "./mock-server-fixture";
import { openShell } from "./shell-harness";

function route(
  endpoint: string,
  fullPath: string,
  source: MockRouteEntry["source"],
  extra: Partial<MockRouteEntry> = {},
): MockRouteEntry {
  return {
    group: "users",
    endpoint,
    httpMethod: "get",
    path: fullPath,
    fullPath,
    source,
    hits: 3,
    avgLatency: 12,
    ...extra,
  };
}

const ROUTES = [
  route("list", "/users", "auto", {
    responseSchema: { id: "string" },
    exampleResponse: { id: "u_1" },
  }),
  route("get", "/users/:id", "override"),
  route("remove", "/users/:id", "scenario", { httpMethod: "delete", hits: 0 }),
];

async function settle(interaction: () => void): Promise<void> {
  await act(async () => {
    interaction();
  });
}

beforeEach(() => {
  useStudioStore.setState({
    connected: true,
    connectionStatus: "connected",
    requests: [],
    heldRequests: [],
  });
  useMockStore.setState({
    servers: { "api-mock": mockServer({ routes: ROUTES }) },
    activeServerId: "api-mock",
    logs: [],
  });
});

afterEach(cleanup);

describe("the routes' data", () => {
  it("counts each kind, narrows to one, and keeps only what differs in the address", () => {
    expect(routeKindCounts(ROUTES)).toEqual({ all: 3, auto: 1, override: 1, scenario: 1 });
    expect(filterRoutes(ROUTES, "users.get", "all").map((r) => r.endpoint)).toEqual(["get"]);
    expect(filterRoutes(ROUTES, "", "scenario").map((r) => r.endpoint)).toEqual(["remove"]);
    expect(validateMockRoutesSearch({ kind: "all", q: "", open: "GET /users" })).toEqual({
      open: "GET /users",
    });
  });
});

describe("the Routes tab", () => {
  it("lists every route with its handler, average and hits", async () => {
    await openShell("/next/mocks/routes");

    const list = screen.getByRole("region", { name: "Routes" });
    expect(within(list).getAllByRole("button")).toHaveLength(3);
    expect(within(list).getByText("override")).toBeTruthy();
  });

  it("opens a route for what answers it, its shape and a sample, kept in the address", async () => {
    const router = await openShell("/next/mocks/routes");

    await settle(() =>
      fireEvent.click(screen.getByRole("button", { name: /\/users\s*users\.list/ })),
    );

    expect(router.state.location.search).toMatchObject({ open: "GET /users" });
    expect(screen.getByText(/Generated from the response schema of users\.list/)).toBeTruthy();
    expect(screen.getByText("http://localhost:7001/users")).toBeTruthy();
    expect(screen.getByText('"u_1"')).toBeTruthy();
  });

  it("narrows to a kind from the address", async () => {
    await openShell("/next/mocks/routes?kind=scenario");

    expect(
      within(screen.getByRole("region", { name: "Routes" })).getAllByRole("button"),
    ).toHaveLength(1);
  });
});
