/**
 * @vitest-environment jsdom
 *
 * Before a page has first connected to Studio it has nothing to show, and
 * says so as loading — in the shape of what it will show — never as an
 * empty project: no "Waiting for requests", "No endpoints yet" or "No app
 * attached" before Studio has had its say, nor once connected before
 * Studio has said which apps are attached and sent the requests it
 * captured. The rule itself decides by the
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

describe("a page connected before Studio has sent the requests it captured", () => {
  beforeEach(() => {
    useStudioStore.setState({
      connected: true,
      connectionStatus: "connected",
      received: { runtimes: true, requests: false },
      configStatus: LOADED,
    });
  });

  it.each([
    ["/timeline", "Waiting for requests"],
    ["/waterfall", "Waiting for requests"],
    ["/analytics", "No completed requests yet"],
    ["/audit", "No requests to audit"],
    ["/middleware", "No call has run through middleware yet"],
    ["/compare", "Compare needs two finished requests"],
  ])("%s shows the requests loading, not that none came", async (url, empty) => {
    await openShell(url);

    expect(screen.getByRole("status", { name: "" }).textContent).toBe("Loading the requests");
    expect(screen.queryByText(empty)).toBeNull();
  });

  it("says none came once Studio has sent none", async () => {
    await openShell("/timeline");

    act(() => useStudioStore.getState().setReceived("requests"));

    expect(screen.getByText("Waiting for requests")).toBeTruthy();
  });
});

describe("a page that goes back to the live requests from a saved session", () => {
  it("shows them loading until Studio sends them, not that none came", async () => {
    useStudioStore.setState({
      connected: true,
      connectionStatus: "connected",
      received: EVERYTHING,
      configStatus: LOADED,
      shownSession: { id: "s_1", name: "login flow" },
    });
    await openShell("/timeline");

    act(() => useStudioStore.getState().showLive());

    expect(screen.getByRole("status", { name: "" }).textContent).toBe("Loading the requests");
    expect(screen.queryByText("Waiting for requests")).toBeNull();
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

  it("waits, once connected, until Studio has sent the requests it captured", () => {
    const connected = { status: "connected", config: LOADED, sourceCount: 0 } as const;
    const runtimesOnly = { runtimes: true, requests: false } as const;

    expect(firstLoad({ ...connected, received: runtimesOnly }).requests).toBe(true);
    expect(firstLoad({ ...connected, received: EVERYTHING }).requests).toBe(false);
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
