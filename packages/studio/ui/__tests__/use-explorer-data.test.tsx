/**
 * @vitest-environment jsdom
 */
/**
 * The Explorer shows the API the config declares, as the APIs page lists
 * it, before and after traffic: every source, group and endpoint with its
 * declared path, method and transport, and the middleware that ran.
 *
 * It used to build its graph from traffic alone: "No API sources" until the
 * first call, then only the endpoints called, with paths guessed from URLs
 * (`/faults/404` as `/faults/:id`), and no middleware anywhere.
 */
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import type { RequestEntry } from "@/store";
import { useStudioStore } from "@/store";
import type { ScannedEndpoint, ScannedSource } from "@/views/apis/types";
import { useExplorerData } from "@/views/explorer/use-explorer-data";

function declared(
  name: string,
  httpMethod: ScannedEndpoint["analysis"]["httpMethod"],
  path: string,
  extra: Partial<ScannedEndpoint["analysis"]> = {},
): ScannedEndpoint {
  return {
    name,
    analysis: {
      hasResponseType: true,
      hasVariablesType: false,
      hasValidation: true,
      httpMethod,
      path,
      type: httpMethod === "get" ? "query" : "mutation",
      middleware: ["stamp-header", "timing-after"],
      ...extra,
    },
  };
}

const API: ScannedSource = {
  name: "api",
  baseURL: "http://upstream.test",
  filePath: "src/api.ts",
  isImported: false,
  hasClient: false,
  groups: [
    {
      name: "faults",
      prefix: "faults",
      filePath: "src/api.ts",
      endpoints: [declared("notFound", "get", "404"), declared("badInput", "post", "echo")],
    },
    {
      name: "users",
      prefix: "users",
      filePath: "src/api.ts",
      endpoints: [declared("get", "get", ":id")],
    },
    {
      name: "live",
      prefix: "live",
      filePath: "src/api.ts",
      endpoints: [
        declared("ticks", "get", "", { transport: "sse" }),
        declared("remoteTicks", "get", "sse", { transport: "sse" }),
      ],
    },
  ],
};

function called(group: string, method: string, middleware: string[]): RequestEntry {
  return {
    id: `${group}.${method}`,
    source: "api",
    group,
    method,
    variables: undefined,
    mode: "direct",
    status: "success",
    middlewareCount: middleware.length,
    middlewareEntries: middleware.map((name, index) => ({
      requestId: `${group}.${method}`,
      name,
      index,
      startedAt: 1,
      status: "completed" as const,
    })),
    hasValidation: { variables: false, response: true },
    startedAt: 1,
    url: `http://upstream.test/${group}/404`,
    sessionId: "server",
  };
}

const endpoint = (data: ReturnType<typeof useExplorerData>, group: string, method: string) =>
  data.endpoints.find((e) => e.group === group && e.method === method);

beforeEach(() => {
  useStudioStore.setState({ scanSources: [API], requests: [] });
});

describe("the Explorer before any traffic", () => {
  it("shows the declared sources, groups and endpoints", () => {
    const { result } = renderHook(() => useExplorerData());

    expect(result.current.isEmpty).toBe(false);
    expect(result.current.sources.map((s) => s.name)).toEqual(["api"]);
    expect(result.current.groups.map((g) => g.name)).toEqual(["faults", "users", "live"]);
    expect(result.current.endpoints).toHaveLength(5);
  });

  it("shows each endpoint's declared path, method, transport and middleware", () => {
    const { result } = renderHook(() => useExplorerData());

    expect(endpoint(result.current, "faults", "notFound")).toMatchObject({
      fullPath: "/faults/404",
      httpMethod: "GET",
    });
    expect(endpoint(result.current, "faults", "badInput")).toMatchObject({
      fullPath: "/faults/echo",
      httpMethod: "POST",
    });
    expect(endpoint(result.current, "users", "get")?.fullPath).toBe("/users/:id");
    expect(endpoint(result.current, "live", "remoteTicks")).toMatchObject({
      fullPath: "/live/sse",
      transport: "sse",
    });
    expect(endpoint(result.current, "live", "ticks")).toMatchObject({
      fullPath: "",
      transport: "sse",
    });
    expect(endpoint(result.current, "users", "get")?.middleware).toEqual([
      "stamp-header",
      "timing-after",
    ]);
  });
});

describe("the Explorer after traffic", () => {
  it("keeps the declared path, and shows the middleware that ran", () => {
    useStudioStore.setState({
      requests: [called("faults", "notFound", ["stamp-header", "boom-mw", "timing-after"])],
    });

    const { result } = renderHook(() => useExplorerData());

    expect(endpoint(result.current, "faults", "notFound")).toMatchObject({
      fullPath: "/faults/404",
      middleware: ["stamp-header", "boom-mw", "timing-after"],
    });
    expect(endpoint(result.current, "faults", "notFound")?.metrics.totalRequests).toBe(1);
  });

  it("adds an endpoint that was called but is not declared", () => {
    useStudioStore.setState({ requests: [called("faults", "hidden", [])] });

    const { result } = renderHook(() => useExplorerData());

    expect(endpoint(result.current, "faults", "hidden")).toBeDefined();
    expect(result.current.endpoints).toHaveLength(6);
  });
});
