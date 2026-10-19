/**
 * @vitest-environment jsdom
 *
 * Before a page has first connected to Studio it has nothing to show, and
 * says so as loading — in the shape of what it will show — never as an
 * empty project: no "Waiting for requests", "No endpoints yet" or "No app
 * attached" before Studio has had its say, nor once connected before
 * Studio has said which apps are attached. The rule itself decides by the
 * connection, by what Studio has sent, and by how the config loads.
 */
import { act, cleanup, screen } from "@testing-library/react";
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

const NOTHING = { runtimes: false, requests: false } as const;
const EVERYTHING = { runtimes: true, requests: true } as const;

beforeEach(() => {
  useStudioStore.setState({
    connected: false,
    connectionStatus: "connecting",
    received: NOTHING,
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

describe("a page connected before Studio has named the apps attached", () => {
  beforeEach(() => {
    useStudioStore.setState({
      connected: true,
      connectionStatus: "connected",
      configStatus: LOADED,
    });
  });

  it("shows the Playground loading, not that no app is attached", async () => {
    await openShell("/playground");

    expect(screen.getByRole("status", { name: "" }).textContent).toBe("Loading the endpoints");
    expect(screen.queryByText("No app attached")).toBeNull();
  });

  it("says no app is attached once Studio has said none is", async () => {
    await openShell("/playground");

    act(() => useStudioStore.getState().setReceived("runtimes"));

    expect(screen.getByText("No app attached")).toBeTruthy();
  });
});

describe("what a page still waits for", () => {
  it("waits for everything before it first connects", () => {
    const status = "connecting";

    expect(firstLoad({ status, received: NOTHING, config: null, sourceCount: 0 })).toEqual({
      requests: true,
      runtimes: true,
      sources: true,
    });
  });

  it("waits, once connected, until Studio has said which apps are attached", () => {
    const connected = { status: "connected", config: LOADED, sourceCount: 0 } as const;

    expect(firstLoad({ ...connected, received: NOTHING }).runtimes).toBe(true);
    expect(firstLoad({ ...connected, received: EVERYTHING }).runtimes).toBe(false);
  });

  it("waits for the sources while Studio loads the config, and for nothing once it has", () => {
    const starting = { state: "starting", revision: 0 } as const;
    const connected = { status: "connected", received: EVERYTHING, sourceCount: 0 } as const;

    expect(firstLoad({ ...connected, config: starting })).toEqual({
      requests: false,
      runtimes: false,
      sources: true,
    });
    expect(firstLoad({ ...connected, config: LOADED }).sources).toBe(false);
  });

  it("keeps showing the sources it has while Studio loads the config again", () => {
    const starting = { state: "starting", revision: 0 } as const;

    expect(
      firstLoad({ status: "connected", received: EVERYTHING, config: starting, sourceCount: 2 })
        .sources,
    ).toBe(false);
  });

  it("waits for nothing once Studio cannot be reached: the page says what it has", () => {
    const status = "disconnected";

    expect(firstLoad({ status, received: NOTHING, config: null, sourceCount: 0 })).toEqual({
      requests: false,
      runtimes: false,
      sources: false,
    });
  });
});
