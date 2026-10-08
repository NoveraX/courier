/**
 * @vitest-environment jsdom
 *
 * An endpoint's contract in the Explorer: confirmed by traffic, drifted from
 * its response schema — each difference said with when, how often and from
 * where, and the fields to declare — or not observed yet; a drifted endpoint
 * marked in the list; and what was seen forgotten once the schema is fixed.
 */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-client", () => ({ post: vi.fn(), get: vi.fn(), apiClient: { post: vi.fn() } }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("sonner", () => ({ toast, Toaster: () => null }));

import { contractsOf } from "@/features/contract/contract-report";
import { refreshContract, useContractStore } from "@/features/contract/contract-store";
import type { EndpointNode } from "@/features/explorer/explorer-model";
import { post } from "@/lib/api-client";
import { EndpointContract } from "@/screens/explorer/endpoint-contract";

const NOW = 10_000_000;

const REPORT = {
  endpoints: [
    {
      source: "shop",
      endpoint: "products.get",
      state: "drifted",
      calls: 40,
      lastSeen: NOW - 60_000,
      cut: 0,
      drift: [
        {
          path: "rating",
          kind: "undeclared",
          observed: ["number"],
          firstSeen: NOW - 7_200_000,
          lastSeen: NOW - 60_000,
          count: 12,
          places: ["api.example.com"],
        },
        {
          path: "price",
          kind: "type",
          observed: ["string"],
          declared: ["number"],
          firstSeen: NOW,
          lastSeen: NOW,
          count: 1,
          places: [],
        },
        {
          path: "seller",
          kind: "missing",
          observed: ["object"],
          firstSeen: NOW,
          lastSeen: NOW,
          count: 3,
          places: [],
        },
      ],
      fix: [
        { within: "", line: "rating: z.number().optional()" },
        { within: "seller", line: "verified: z.boolean()" },
      ],
    },
    { source: "shop", endpoint: "cart", state: "confirmed", calls: 5, cut: 0, drift: [], fix: [] },
    { source: "shop", endpoint: "orders.list", state: "bogus" },
  ],
};

function endpoint(group: string, method: string): EndpointNode {
  return { source: "shop", group, method, hasResponseSchema: true } as unknown as EndpointNode;
}

beforeEach(async () => {
  vi.mocked(post).mockResolvedValue(REPORT);
  await refreshContract();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  useContractStore.setState({ byEndpoint: new Map(), problem: undefined });
});

describe("an endpoint's contract", () => {
  it("names each difference with when, how often and from where, and the fields to declare", () => {
    render(<EndpointContract endpoint={endpoint("products", "get")} now={NOW} />);
    const section = within(screen.getByRole("region", { name: "Contract" }));
    const list = within(section.getByRole("list", { name: "Differences from the schema" }));

    expect(section.getByText("Drifted from its schema")).toBeTruthy();
    expect(list.getByText("not in the schema, which drops it · came as number")).toBeTruthy();
    expect(
      list.getByText(/first seen 2 hours ago .* in 12 of 40 answers · from api.example.com/),
    ).toBeTruthy();
    expect(list.getByText("came as string; the schema takes number")).toBeTruthy();
    expect(list.getByText("missing from 3 of 40 answers")).toBeTruthy();
    expect(
      section.getByText(/rating: z.number\(\).optional\(\),[\s\S]*\/\/ in seller/),
    ).toBeTruthy();
  });

  it("says a contract confirmed by traffic, and forgets what was seen when asked", async () => {
    render(<EndpointContract endpoint={endpoint("", "cart")} now={NOW} />);

    expect(screen.getByText("Confirmed by traffic")).toBeTruthy();
    expect(screen.getByText("Every one of 5 answers fits its response schema.")).toBeTruthy();
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Forget what was seen" })),
    );

    expect(vi.mocked(post)).toHaveBeenCalledWith("/api/contract/forget", {
      source: "shop",
      endpoint: "cart",
    });
    expect(toast.success).toHaveBeenCalled();
  });

  it("shows nothing for an endpoint without a response schema, and reads only entries sent whole", () => {
    const loose = { ...endpoint("products", "get"), hasResponseSchema: false };
    const { container } = render(<EndpointContract endpoint={loose} now={NOW} />);

    expect(container.textContent).toBe("");
    expect(contractsOf(REPORT).map((contract) => contract.endpoint)).toEqual([
      "products.get",
      "cart",
    ]);
  });
});
