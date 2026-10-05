/**
 * The Explorer shows the API the config declares, as the APIs page lists
 * it, before and after traffic: every source, group and endpoint with its
 * declared path, method and transport, and the middleware that ran — not a
 * graph built from traffic alone, empty until the first call, with paths
 * guessed from URLs (`/faults/404` as `/faults/:id`) — and a source seen
 * only in traffic beside the declared ones.
 */
import { describe, expect, it } from "vitest";

import type { ScannedEndpoint, ScannedSource } from "@/features/apis/types";
import type { ExplorerModel } from "@/features/explorer/explorer-model";
import { explorerModelOf } from "@/features/explorer/explorer-model";
import type { RequestEntry } from "@/store";
import { buildCatalog } from "@/store/build-catalog";
import { trafficRequest } from "./playground-fixtures";

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

function explorer(requests: RequestEntry[] = []): ExplorerModel {
  return explorerModelOf(buildCatalog([API], requests), requests, 10_000, 500);
}

const endpoint = (model: ExplorerModel, group: string, method: string) =>
  model.endpoints.find((e) => e.group === group && e.method === method);

describe("the Explorer before any traffic", () => {
  it("shows the declared sources, groups and endpoints", () => {
    const model = explorer();

    expect(model.sources.map((s) => s.name)).toEqual(["api"]);
    expect(new Set(model.groups.map((g) => g.name))).toEqual(new Set(["faults", "users", "live"]));
    expect(model.endpoints).toHaveLength(5);
  });

  it("shows each endpoint's declared path, method, transport and middleware", () => {
    const model = explorer();

    expect(endpoint(model, "faults", "notFound")).toMatchObject({
      path: "/faults/404",
      httpMethod: "GET",
    });
    expect(endpoint(model, "faults", "badInput")).toMatchObject({
      path: "/faults/echo",
      httpMethod: "POST",
    });
    expect(endpoint(model, "users", "get")?.path).toBe("/users/:id");
    expect(endpoint(model, "live", "remoteTicks")).toMatchObject({
      path: "/live/sse",
      transport: "sse",
    });
    expect(endpoint(model, "live", "ticks")?.transport).toBe("sse");
    expect(endpoint(model, "users", "get")?.middleware).toEqual(["stamp-header", "timing-after"]);
  });
});

describe("the Explorer after traffic", () => {
  it("keeps the declared path, and shows the middleware that ran", () => {
    const model = explorer([
      called("faults", "notFound", ["stamp-header", "boom-mw", "timing-after"]),
    ]);

    expect(endpoint(model, "faults", "notFound")).toMatchObject({
      path: "/faults/404",
      middleware: ["stamp-header", "boom-mw", "timing-after"],
    });
    expect(endpoint(model, "faults", "notFound")?.requests).toHaveLength(1);
  });

  it("adds an endpoint that was called but is not declared", () => {
    const model = explorer([called("faults", "hidden", [])]);

    expect(endpoint(model, "faults", "hidden")).toBeDefined();
    expect(model.endpoints).toHaveLength(6);
  });

  it("keeps a source seen only in traffic beside the declared ones", () => {
    const model = explorer([trafficRequest()]);

    expect(model.sources.map((s) => s.name)).toEqual(["api", "localhost"]);
  });
});
