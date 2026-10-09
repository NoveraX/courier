/**
 * @vitest-environment jsdom
 *
 * Fixing a response schema from the Explorer: the contract section offers
 * the fix for a Zod schema, and says why for another library's; the dialog
 * shows the change as a diff of the file it is written in, with what is
 * left for the person; Apply sends the change's digest, and its toast
 * carries Undo; a change that went stale is shown again.
 */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-client", () => ({ post: vi.fn(), get: vi.fn(), apiClient: { post: vi.fn() } }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("sonner", () => ({ toast, Toaster: () => null }));

import { contractsOf } from "@/features/contract/contract-report";
import { useContractStore } from "@/features/contract/contract-store";
import { useSchemaFixDialog } from "@/features/contract/schema-fix-store";
import type { EndpointNode } from "@/features/explorer/explorer-model";
import { post } from "@/lib/api-client";
import { EndpointContract } from "@/screens/explorer/endpoint-contract";
import { SchemaFixDialog } from "@/screens/explorer/schema-fix-dialog";

const DRIFTED = {
  source: "shop",
  endpoint: "products.get",
  state: "drifted",
  calls: 3,
  lastSeen: 1,
  cut: 0,
  drift: [
    {
      path: "rating",
      kind: "undeclared",
      observed: ["number"],
      firstSeen: 1,
      lastSeen: 1,
      count: 2,
      places: [],
    },
  ],
  fix: [{ within: "", line: "rating: z.number().optional()" }],
  vendor: "zod",
};

const PREVIEW = {
  status: "ready",
  files: [
    {
      file: "src/api/schemas.ts",
      hunks: [
        {
          lines: [
            { kind: "context", text: "  stock: z.number(),", oldLine: 9, newLine: 9 },
            { kind: "add", text: "  rating: z.number().optional(),", oldLine: null, newLine: 10 },
            { kind: "context", text: "});", oldLine: 10, newLine: 11 },
          ],
        },
      ],
    },
  ],
  fixed: ["rating"],
  left: [
    { path: "seller.tags[]", why: "the schema is built by an expression Studio does not read" },
  ],
  digest: "d".repeat(64),
};

const endpoint = {
  source: "shop",
  group: "products",
  method: "get",
  hasResponseSchema: true,
} as EndpointNode;

function answer(routes: Record<string, unknown[]>): void {
  vi.mocked(post).mockImplementation(async (url: string) => routes[url]?.shift());
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((done) => setTimeout(done, 0));
  });
}

beforeEach(() => {
  useContractStore.setState({ byEndpoint: new Map() });
  useSchemaFixDialog.setState({ target: null });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function showContract(entry: Record<string, unknown>): void {
  const [contract] = contractsOf({ endpoints: [entry] });
  if (contract)
    useContractStore.setState({ byEndpoint: new Map([["shop:products.get", contract]]) });
  render(
    <>
      <EndpointContract endpoint={endpoint} now={2} />
      <SchemaFixDialog />
    </>,
  );
}

describe("fixing a response schema", () => {
  it("shows the change in the file the schema is written in, and applies the one shown", async () => {
    answer({
      "/api/contract/fix/preview": [PREVIEW],
      "/api/contract/fix/apply": [
        { status: "applied", files: ["src/api/schemas.ts"], fixed: ["rating"], left: [] },
      ],
      "/api/contract/report": [{ endpoints: [] }],
    });
    showContract(DRIFTED);

    fireEvent.click(screen.getByRole("button", { name: "Fix the schema…" }));
    await settle();
    const dialog = within(screen.getByRole("dialog"));

    expect(dialog.getByRole("region", { name: "Change to src/api/schemas.ts" })).toBeTruthy();
    expect(
      dialog.getByText("rating: z.number().optional(),", { normalizer: (text) => text.trim() }),
    ).toBeTruthy();
    expect(
      dialog.getByText(/the schema is built by an expression Studio does not read/),
    ).toBeTruthy();
    fireEvent.click(dialog.getByRole("button", { name: "Apply the change" }));
    await settle();

    expect(vi.mocked(post)).toHaveBeenCalledWith("/api/contract/fix/apply", {
      source: "shop",
      endpoint: "products.get",
      digest: PREVIEW.digest,
    });
    expect(toast.success).toHaveBeenCalledWith(
      "Changed shop.products.get's schema in src/api/schemas.ts",
      expect.objectContaining({ action: expect.objectContaining({ label: "Undo" }) }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("asks for the change again when it went stale, and undoes the one applied", async () => {
    answer({
      "/api/contract/fix/preview": [PREVIEW, PREVIEW],
      "/api/contract/fix/apply": [{ status: "stale" }],
      "/api/contract/fix/undo": [{ status: "undone", files: ["src/api/schemas.ts"] }],
      "/api/contract/report": [{ endpoints: [] }],
    });
    showContract(DRIFTED);

    fireEvent.click(screen.getByRole("button", { name: "Fix the schema…" }));
    await settle();
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Apply the change" }),
    );
    await settle();

    expect(toast.info).toHaveBeenCalledWith(expect.stringContaining("review it again"));
    expect(
      vi.mocked(post).mock.calls.filter(([url]) => url === "/api/contract/fix/preview"),
    ).toHaveLength(2);

    const { undoSchemaFix } = await import("@/features/contract/apply-schema-fix");
    await act(() => undoSchemaFix({ source: "shop", endpoint: "products.get" }));
    expect(toast.success).toHaveBeenCalledWith(
      "Put src/api/schemas.ts back as it was before shop.products.get's schema changed",
    );
  });

  it("says why it writes nothing for another library's schema, and for a change it cannot place", async () => {
    answer({
      "/api/contract/fix/preview": [
        {
          status: "manual",
          reason: "Studio could not place a change in shop.products.get's schema.",
          left: [],
        },
      ],
    });
    showContract({ ...DRIFTED, vendor: "valibot" });

    expect(screen.queryByRole("button", { name: "Fix the schema…" })).toBeNull();
    expect(
      screen.getByText(/Studio writes the change itself for a Zod schema; this one is valibot/),
    ).toBeTruthy();

    cleanup();
    showContract(DRIFTED);
    fireEvent.click(screen.getByRole("button", { name: "Fix the schema…" }));
    await settle();

    expect(within(screen.getByRole("dialog")).getByText(/could not place a change/)).toBeTruthy();
    expect(
      (
        within(screen.getByRole("dialog")).getByRole("button", {
          name: "Apply the change",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
});
