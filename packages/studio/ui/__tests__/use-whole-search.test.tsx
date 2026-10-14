/**
 * @vitest-environment jsdom
 *
 * A search over the whole of an answer shown in part, past what it finds:
 * one that fails on the way says why and leaves the part shown searched,
 * rather than searching on with no end; and the body is let go once the
 * view moves on from it.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PayloadView } from "@/features/requests/payload-view";
import { askWholeSearch, forgetWholeBody } from "@/features/requests/whole-search-client";
import { PayloadTab } from "@/inspector/tabs/payload-tab";
import type { WholeSource } from "@/inspector/tabs/use-whole-search";

vi.mock("@/features/requests/whole-search-client", () => ({
  askWholeSearch: vi.fn(),
  forgetWholeBody: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

const CUT: PayloadView = {
  value: { data: { cities: [{ id: 0, name: "Kazan-0" }, "… 4,999 more items"] } },
  cutFrom: 120_000,
  chips: [],
  issues: new Map(),
};

function source(key: string): WholeSource {
  return { key, load: () => Promise.resolve({ ok: true, data: '{"data":{"cities":[]}}' }) };
}

function tab(whole: WholeSource): React.ReactElement {
  return (
    <PayloadTab
      view={CUT}
      mode="tree"
      onMode={vi.fn()}
      whole={whole}
      searchLabel="Find in the answer"
    />
  );
}

describe("a search over the whole answer, past what it finds", () => {
  it("says why, and searches the part shown, when it fails on the way", async () => {
    vi.mocked(askWholeSearch).mockRejectedValueOnce(new Error("The worker refused the body."));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    render(tab(source("request:s1:r1:response")));

    fireEvent.change(screen.getByRole("searchbox", { name: "Find in the answer" }), {
      target: { value: "kazan" },
    });

    expect(
      await screen.findByText(
        "The whole body could not be searched, so the search covers the part shown. The worker refused the body.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("1 / 1")).toBeTruthy();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("could not be searched"),
      expect.any(Error),
    );
  });

  it("lets the body go once the view moves on from it", () => {
    const { rerender, unmount } = render(tab(source("request:s1:r1:response")));

    rerender(tab(source("request:s1:r2:response")));
    unmount();

    expect(vi.mocked(forgetWholeBody).mock.calls).toEqual([
      ["request:s1:r1:response"],
      ["request:s1:r2:response"],
    ]);
  });
});
