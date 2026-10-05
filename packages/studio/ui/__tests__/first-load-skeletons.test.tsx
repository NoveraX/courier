/**
 * @vitest-environment jsdom
 *
 * Before a page has first connected to Studio it has nothing to show, and
 * says so as loading — in the shape of what it will show — never as an
 * empty project: no "Waiting for requests", "No endpoints yet" or "No app
 * attached" before Studio has had its say. The rule itself decides by the
 * connection and by how the config loads.
 */
import { cleanup, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { firstLoad } from "@/features/loading/first-load";
import { useStudioStore } from "@/store";
import { useMockStore } from "@/store/mock-slice";
import { openShell } from "./shell-harness";

vi.mock("@/socket", () => ({
  getSocket: () => ({ emit: vi.fn(), on: vi.fn(), off: vi.fn(), connect: vi.fn() }),
}));

const LOADED = {
  state: "loaded",
  revision: 1,
  configFile: "courier.config.ts",
  loadedAt: Date.now(),
} as const;

beforeEach(() => {
  useStudioStore.setState({
    connected: false,
    connectionStatus: "connecting",
    configStatus: null,
    requests: [],
    scanSources: [],
    registrySources: [],
  });
  useMockStore.setState({ servers: {}, activeServerId: null });
});

afterEach(() => cleanup());

describe("a page before it first connects to Studio", () => {
  it.each([
    ["/timeline", "Loading the requests", "Waiting for requests"],
    ["/waterfall", "Loading the requests", "Waiting for requests"],
    ["/analytics", "Loading the requests", "No completed requests yet"],
    ["/explorer", "Loading the endpoints", "No endpoints yet"],
    ["/explorer/overview", "Loading the endpoints", "No endpoints yet"],
    ["/explorer/endpoints", "Loading the endpoints", "No endpoints yet"],
    ["/explorer/heatmap", "Loading the endpoints", "No endpoints yet"],
    ["/playground", "Loading the endpoints", "No app attached"],
    ["/apis", "Loading the APIs", "No APIs yet"],
    ["/mocks", "Loading the mock servers", "No mock servers yet"],
    ["/audit", "Loading the requests", "No requests to audit"],
    ["/middleware", "Loading the requests", "No call has run through middleware yet"],
    ["/compare", "Loading the requests", "Compare needs two finished requests"],
  ])("%s shows what it loads, not an empty project", async (url, loading, empty) => {
    await openShell(url);

    expect(screen.getByRole("status", { name: "" }).textContent).toBe(loading);
    expect(screen.queryByText(empty)).toBeNull();
  });
});

describe("what a page still waits for", () => {
  it("waits for everything before it first connects", () => {
    expect(firstLoad({ status: "connecting", config: null, sourceCount: 0 })).toEqual({
      requests: true,
      sources: true,
    });
  });

  it("waits for the sources while Studio loads the config, and for nothing once it has", () => {
    const starting = { state: "starting", revision: 0 } as const;

    expect(firstLoad({ status: "connected", config: starting, sourceCount: 0 })).toEqual({
      requests: false,
      sources: true,
    });
    expect(firstLoad({ status: "connected", config: LOADED, sourceCount: 0 }).sources).toBe(false);
  });

  it("keeps showing the sources it has while Studio loads the config again", () => {
    expect(
      firstLoad({ status: "connected", config: { state: "starting", revision: 0 }, sourceCount: 2 })
        .sources,
    ).toBe(false);
  });

  it("waits for nothing once Studio cannot be reached: the page says what it has", () => {
    expect(firstLoad({ status: "disconnected", config: null, sourceCount: 0 })).toEqual({
      requests: false,
      sources: false,
    });
  });
});
