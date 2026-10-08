/**
 * @vitest-environment jsdom
 *
 * Declaring a source known only by its traffic: the Explorer offers it for
 * an endpoint courier.config does not declare, sends the source's calls —
 * and only that source's — for Studio to read an OpenAPI document from,
 * and the APIs page opens the import wizard on it.
 */
import { act, cleanup, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-client", () => ({ post: vi.fn(), get: vi.fn(), apiClient: { post: vi.fn() } }));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("sonner", () => ({ toast, Toaster: () => null }));

import { useKeptImport } from "@/apis/kept-import";
import { useAskedImport } from "@/apis/use-asked-import";
import { useImportRequest } from "@/features/apis/import-request";
import { declareFromTraffic } from "@/features/explorer/declare-from-traffic";
import type { EndpointNode } from "@/features/explorer/explorer-model";
import { post } from "@/lib/api-client";
import { EndpointTrafficOnly } from "@/screens/explorer/endpoint-traffic-only";
import { useStudioStore } from "@/store";
import { requestEntry } from "./request-entry-fixture";

const DOCUMENT = '{ "openapi": "3.1.0" }\n';

beforeEach(() => {
  useStudioStore.setState({
    requests: [
      requestEntry({
        id: "a",
        source: "billing",
        group: "invoices",
        method: "get",
        statusCode: 200,
      }),
      requestEntry({ id: "b", source: "shop", method: "list" }),
    ],
  });
  useImportRequest.setState({ request: null });
  useKeptImport.setState({ kept: null });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function endpoint(trafficOnly: boolean): EndpointNode {
  return {
    source: "billing",
    group: "invoices",
    method: "get",
    trafficOnly,
  } as unknown as EndpointNode;
}

describe("declaring a source from its traffic", () => {
  it("is offered only for an endpoint courier.config does not declare", () => {
    const { rerender } = render(<EndpointTrafficOnly endpoint={endpoint(true)} />);
    expect(screen.getByRole("button", { name: "Declare billing from traffic" })).toBeTruthy();

    rerender(<EndpointTrafficOnly endpoint={endpoint(false)} />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("sends that source's calls, and asks the import wizard to open on the document read", async () => {
    vi.mocked(post).mockResolvedValue({
      text: DOCUMENT,
      endpoints: 1,
      leftOut: { streams: 2, unanswered: 0, conflicting: ["invoices.archive"] },
    });

    const asked = await declareFromTraffic("billing");

    expect(asked).toBe(true);
    expect(toast.info).toHaveBeenCalledWith(
      "Read billing from its traffic. Left out: 2 stream calls; invoices.archive, whose route another endpoint took.",
    );
    expect(vi.mocked(post)).toHaveBeenCalledWith("/api/apis/traffic-spec", {
      source: "billing",
      calls: [
        expect.objectContaining({
          group: "invoices",
          method: "get",
          status: 200,
          transport: "http",
        }),
      ],
    });
    expect(useImportRequest.getState().request).toEqual({ content: DOCUMENT });
  });

  it("says so when no call could be read into an endpoint, asking nothing", async () => {
    vi.mocked(post).mockResolvedValue({ text: DOCUMENT, endpoints: 0 });

    expect(await declareFromTraffic("billing")).toBe(false);
    expect(useImportRequest.getState().request).toBeNull();
    expect(toast.error).toHaveBeenCalled();
  });

  it("opens the wizard on the raw document once the page may import, and takes the ask", () => {
    const openWizard = vi.fn();
    useImportRequest.setState({ request: { content: DOCUMENT } });

    const { rerender } = renderHook(({ allowed }) => useAskedImport(openWizard, allowed), {
      initialProps: { allowed: false },
    });
    expect(openWizard).not.toHaveBeenCalled();
    act(() => rerender({ allowed: true }));

    expect(openWizard).toHaveBeenCalledWith("raw");
    expect(useKeptImport.getState().kept).toEqual({ source: "raw", content: DOCUMENT });
    expect(useImportRequest.getState().request).toBeNull();
  });
});
