/**
 * @vitest-environment jsdom
 *
 * An import declared from traffic stays tied to it: the wizard's write says
 * so; managing the import reads its traffic again rather than asking for a
 * spec, with no way back to a paste; and the Explorer, for an endpoint the
 * app calls that the declaration does not have, opens the manage dialog on
 * the import with that endpoint picked to add.
 */
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-client", () => ({ post: vi.fn(), get: vi.fn(), apiClient: { post: vi.fn() } }));
const navigate = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { importBody } from "@/apis/import-actions";
import { useAskedManage } from "@/apis/use-asked-manage";
import { useManage } from "@/apis/use-manage";
import { INITIAL_IMPORT_STATE } from "@/features/apis/initial-import-state";
import { useManageRequest } from "@/features/apis/manage-request";
import type { ParsedSpec, SourceSummary } from "@/features/apis/types";
import type { EndpointNode } from "@/features/explorer/explorer-model";
import { post } from "@/lib/api-client";
import { EndpointTrafficOnly } from "@/screens/explorer/endpoint-traffic-only";
import { useStudioStore } from "@/store";
import { requestEntry } from "./request-entry-fixture";

const SPEC: ParsedSpec = {
  title: "catalogue",
  version: "0.0.0",
  description: "",
  baseURL: "http://127.0.0.1:4611",
  format: "openapi3",
  groups: [],
  schemas: {},
  securitySchemes: [],
  skipped: [],
};
const CATALOGUE: SourceSummary = {
  name: "catalogue",
  specUrl: "",
  importType: "raw",
  outputDir: "src/api",
  options: {},
  fromTraffic: true,
};
const INVENTORY = {
  groups: [
    {
      name: "items",
      prefix: "/products",
      isCustomGroup: false,
      endpoints: [
        { group: "items", name: "list", httpMethod: "get", path: "", status: "active" },
        { group: "items", name: "get", httpMethod: "get", path: "/:id", status: "available" },
      ],
    },
  ],
  specChanged: true,
  totalActive: 1,
  totalAvailable: 1,
  totalCustom: 0,
};

beforeEach(() => {
  useStudioStore.setState({
    requests: [requestEntry({ id: "c1", source: "catalogue", group: "items", method: "get" })],
    scanSources: [
      {
        name: "catalogue",
        baseURL: "http://127.0.0.1:4611",
        filePath: "src/api/catalogue/source.ts",
        groups: [],
        isImported: true,
        hasClient: true,
      },
    ],
    registrySources: [CATALOGUE],
  });
  useManageRequest.setState({ request: null });
  vi.mocked(post).mockImplementation(async (url: string) => {
    if (url === "/api/apis/traffic-spec") return { text: '{"openapi":"3.1.0"}', endpoints: 2 };
    if (url === "/api/apis/parse") return SPEC;
    if (url === "/api/apis/manage/inventory") return INVENTORY;
    throw new Error(`unexpected ${url}`);
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("an import declared from traffic", () => {
  it("is written saying so, and only from a raw specification", () => {
    const spec = SPEC;
    const raw = { ...INITIAL_IMPORT_STATE, source: "raw" as const, content: "{}", spec };

    expect(importBody({ ...raw, fromTraffic: true })).toMatchObject({
      importType: "raw",
      origin: "traffic",
    });
    expect(importBody({ ...raw, fromTraffic: false })).not.toHaveProperty("origin");
    expect(
      importBody({ ...raw, source: "url", content: "https://x.example/a.json", fromTraffic: true }),
    ).not.toHaveProperty("origin");
  });

  it("is managed from its traffic, read again, with the endpoint picked to add", async () => {
    const { result } = renderHook(() => useManage());

    await act(async () => {
      result.current.start(CATALOGUE, undefined, { group: "items", name: "get" });
      await new Promise((done) => setTimeout(done, 0));
    });

    expect(vi.mocked(post).mock.calls.map(([url]) => url)).toEqual([
      "/api/apis/traffic-spec",
      "/api/apis/parse",
      "/api/apis/manage/inventory",
    ]);
    expect(vi.mocked(post)).toHaveBeenCalledWith(
      "/api/apis/traffic-spec",
      expect.objectContaining({ source: "catalogue" }),
    );
    expect(result.current.step).toBe("inventory");
    expect(result.current.fromTraffic).toBe(true);
    expect([...(result.current.toAdd.items ?? [])]).toEqual(["get"]);
  });

  it("is offered from the Explorer for an endpoint the app calls that it does not have", () => {
    const endpoint = {
      source: "catalogue",
      group: "items",
      method: "get",
      trafficOnly: true,
    } as unknown as EndpointNode;
    render(<EndpointTrafficOnly endpoint={endpoint} />);

    fireEvent.click(screen.getByRole("button", { name: "Add items.get from traffic" }));

    expect(screen.getByRole("region", { name: "Called, but not declared" }).textContent).toMatch(
      /catalogue was declared from its traffic, in src\/api\/catalogue\/source\.ts, before the app called items\.get/,
    );
    expect(useManageRequest.getState().request).toEqual({
      source: "catalogue",
      picked: { group: "items", name: "get" },
    });
    expect(navigate).toHaveBeenCalledWith({ to: "/apis" });
  });

  it("is opened in the manage dialog once the APIs page lists it, and the ask is taken", () => {
    const start = vi.fn();
    useManageRequest.setState({
      request: { source: "catalogue", picked: { group: "items", name: "get" } },
    });

    const { rerender } = renderHook(({ imports }) => useAskedManage(start, imports), {
      initialProps: { imports: [] as SourceSummary[] },
    });
    expect(start).not.toHaveBeenCalled();
    rerender({ imports: [CATALOGUE] });

    expect(start).toHaveBeenCalledWith(CATALOGUE, undefined, { group: "items", name: "get" });
    expect(useManageRequest.getState().request).toBeNull();
  });
});
