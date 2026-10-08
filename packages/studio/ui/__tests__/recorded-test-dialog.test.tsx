/**
 * @vitest-environment jsdom
 *
 * Saving the requests as a test: the dialog shows the calls checked against
 * the definition now — each one that no longer fits with what broke it —
 * the files, what was left out and replaced, and the test as it will be
 * written; Write sends the plan's digest, and is held back while a file
 * there would be replaced until that is agreed to. A plan that changed is
 * asked for again.
 */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-client", () => ({ post: vi.fn(), get: vi.fn(), apiClient: { post: vi.fn() } }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("sonner", () => ({ toast, Toaster: () => null }));

import { planOf } from "@/features/tests/recorded-test-plan";
import { saveAsTest, useRecordedTestDialog } from "@/features/tests/recorded-test-store";
import { post } from "@/lib/api-client";
import { StudioRequestError } from "@/lib/studio-request-error";
import { RecordedTestDialog } from "@/screens/recorded-test/recorded-test-dialog";
import { useStudioStore } from "@/store";
import { requestEntry } from "./request-entry-fixture";

const PLAN = {
  title: "Checkout flow",
  files: [
    { path: "tests/recorded/checkout-flow.shop.har", content: "{}", replaces: false },
    {
      path: "tests/recorded/checkout-flow.test.ts",
      content: 'import config from "../../courier.config";\n',
      replaces: false,
    },
  ],
  calls: 3,
  endpoints: 2,
  leftOut: { unanswered: 1, unknownSource: 0, repeats: 2 },
  redactions: ["#2 auth.login · variables.password"],
  checks: {
    fits: 2,
    broken: 1,
    unchecked: 0,
    failures: [
      {
        at: 3,
        label: "shop orders.get · GET /orders/o_1 → 200",
        problems: [
          "path changed: recorded at /orders/o_1, but the endpoint now sends to /items/:id",
        ],
      },
    ],
  },
  needs: ["npm install --save-dev vitest"],
  formattedWith: ["Biome 2.5.14"],
  digest: "d".repeat(64),
};

function answer(routes: Record<string, unknown>): void {
  vi.mocked(post).mockImplementation(async (url: string) => {
    const value = routes[url];
    if (value instanceof Error) throw value;
    return value;
  });
}

async function open(): Promise<ReturnType<typeof within>> {
  render(<RecordedTestDialog />);
  await act(async () => {
    saveAsTest({ kind: "shown" });
    await new Promise((done) => setTimeout(done, 400));
  });
  return within(screen.getByRole("dialog"));
}

beforeEach(() => {
  useStudioStore.setState({ requests: [requestEntry({ id: "a" })], shownSession: null });
  useRecordedTestDialog.setState({ target: null });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("saving the requests as a test", () => {
  it("shows the calls checked now, the files, what was left out and the test itself", async () => {
    answer({ "/api/tests/plan": PLAN });

    const dialog = await open();

    expect(dialog.getByText(/1 of 3 calls no longer fit the definition/)).toBeTruthy();
    expect(
      within(dialog.getByRole("list", { name: "Calls that no longer fit" })).getByText(
        /path changed: recorded at \/orders\/o_1/,
      ),
    ).toBeTruthy();
    expect(dialog.getByText("tests/recorded/checkout-flow.shop.har")).toBeTruthy();
    expect(
      dialog.getByText(/Left out: 1 with no answer to check.*2 repeating a call kept/),
    ).toBeTruthy();
    expect(dialog.getByText(/#2 auth.login · variables.password/)).toBeTruthy();
    expect(dialog.getByText("npm install --save-dev vitest")).toBeTruthy();
    expect(dialog.getByText(/laid out by Biome 2.5.14/)).toBeTruthy();
    expect(vi.mocked(post).mock.calls[0]?.[1]).toMatchObject({
      folder: "tests/recorded",
      requests: [expect.objectContaining({ id: "a" })],
    });
  });

  it("writes the plan shown, by its digest, and closes", async () => {
    answer({
      "/api/tests/plan": PLAN,
      "/api/tests/write": { written: ["tests/recorded/checkout-flow.test.ts"] },
    });
    const dialog = await open();

    await act(async () => fireEvent.click(dialog.getByRole("button", { name: "Write the test" })));

    expect(vi.mocked(post)).toHaveBeenLastCalledWith(
      "/api/tests/write",
      expect.objectContaining({ digest: PLAN.digest, replace: false }),
    );
    expect(toast.success).toHaveBeenCalledWith(
      "Wrote tests/recorded/checkout-flow.test.ts and its recordings; vitest runs it with the rest",
    );
    expect(useRecordedTestDialog.getState().target).toBeNull();
  });

  it("holds Write back while a file there would be replaced, until that is agreed to", async () => {
    const replacing = { ...PLAN, files: PLAN.files.map((file) => ({ ...file, replaces: true })) };
    answer({ "/api/tests/plan": replacing, "/api/tests/write": { written: [] } });
    const dialog = await open();
    const write = dialog.getByRole("button", { name: "Write the test" });

    expect(write).toHaveProperty("disabled", true);
    fireEvent.click(dialog.getByRole("checkbox", { name: "Replace the files already there" }));
    await act(async () => fireEvent.click(write));

    expect(vi.mocked(post)).toHaveBeenLastCalledWith(
      "/api/tests/write",
      expect.objectContaining({ replace: true }),
    );
  });

  it("asks for the plan again when it changed since it was shown", async () => {
    const changed = new StudioRequestError(
      "The test is not the one shown any more",
      { error: "The test is not the one shown any more", code: "PLAN_CHANGED" },
      undefined,
    );
    answer({ "/api/tests/plan": PLAN, "/api/tests/write": changed });
    const dialog = await open();

    await act(async () => fireEvent.click(dialog.getByRole("button", { name: "Write the test" })));
    await act(async () => {
      await new Promise((done) => setTimeout(done, 400));
    });

    expect(toast.info).toHaveBeenCalledWith("The test is not the one shown any more");
    expect(vi.mocked(post).mock.calls.filter(([url]) => url === "/api/tests/plan")).toHaveLength(2);
    expect(useRecordedTestDialog.getState().target).not.toBeNull();
  });

  it("says why Studio planned nothing", async () => {
    answer({ "/api/tests/plan": new Error("None of these requests has an answer to check") });

    const dialog = await open();

    expect(dialog.getByRole("alert").textContent).toBe(
      "None of these requests has an answer to check",
    );
    expect(dialog.getByRole("button", { name: "Write the test" })).toHaveProperty("disabled", true);
  });

  it("reads only a plan Studio sent whole", () => {
    expect(planOf({ ...PLAN, files: [{ path: 1 }] })).toBeUndefined();
    expect(planOf(PLAN)?.checks.failures[0]?.at).toBe(3);
  });
});
