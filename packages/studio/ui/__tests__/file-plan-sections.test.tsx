/**
 * @vitest-environment jsdom
 *
 * A write's file plan says what is true of the files: a merged file keeps
 * edits only when it holds some, a file already as Studio would write it is
 * counted, not listed, and a file kept only because a file waiting for
 * consent imports it is listed removed once that file's removal is allowed,
 * as the apply then removes it.
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { FilePlanSummary } from "@/features/apis/types-file-plan";
import { FilePlanSections } from "@/screens/apis/file-plan-sections";

const PLAN: FilePlanSummary = {
  digest: "plan-1",
  dir: "src/api/pets",
  writes: [
    { path: "src/api/pets/pets/index.ts", action: "merge", was: "recorded" },
    { path: "src/api/pets/store/index.ts", action: "merge", was: "recorded-edited" },
    { path: "src/api/pets/source.ts", action: "unchanged", was: "recorded" },
  ],
  removals: [],
  kept: [],
  pending: [],
  blocked: [],
  forgotten: [],
};

afterEach(cleanup);

describe("a write's file plan", () => {
  it("says a merge kept edits only for a file that holds some", () => {
    render(<FilePlanSections plan={PLAN} confirmed={[]} onToggle={() => {}} />);

    const written = within(screen.getByRole("region", { name: "Written" }));
    expect(written.getByText("src/api/pets/pets/index.ts").parentElement?.textContent).toBe(
      "src/api/pets/pets/index.tsmerged",
    );
    expect(written.getByText("src/api/pets/store/index.ts").parentElement?.textContent).toBe(
      "src/api/pets/store/index.tsmerged, your edits kept",
    );
    expect(written.queryByText("src/api/pets/source.ts")).toBeNull();
    expect(screen.getByText("1 file is already as Studio would write it.")).toBeTruthy();
  });

  it("says the files are formatted as the project formats its code, and with what", () => {
    const formatting = { formattedWith: ["Biome 2.5.14"], problem: null };

    render(<FilePlanSections plan={{ ...PLAN, formatting }} confirmed={[]} onToggle={() => {}} />);

    expect(
      screen.getByText("Formatted with Biome 2.5.14, as the project formats its code."),
    ).toBeTruthy();
  });

  it("says why files are written as composed when formatting could not run", () => {
    const formatting = { formattedWith: [], problem: "Biome is configured but not installed" };

    render(<FilePlanSections plan={{ ...PLAN, formatting }} confirmed={[]} onToggle={() => {}} />);

    expect(screen.getByText("Biome is configured but not installed.")).toBeTruthy();
    expect(screen.queryByText(/Formatted with/)).toBeNull();
  });

  it("names every tool that ran, and why one of them did not format a file", () => {
    const formatting = {
      formattedWith: ["Biome 2.5.14", "ESLint 10.12.0", "Prettier 3.9.8"],
      problem: "src/api/pets/index.ts was not formatted with ESLint: it cannot read the file",
    };

    render(<FilePlanSections plan={{ ...PLAN, formatting }} confirmed={[]} onToggle={() => {}} />);

    expect(
      screen.getByText(
        "Formatted with Biome 2.5.14, ESLint 10.12.0 and Prettier 3.9.8, as the project formats its code.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "src/api/pets/index.ts was not formatted with ESLint: it cannot read the file.",
      ),
    ).toBeTruthy();
  });

  it("says nothing of formatting in a project that has no formatter", () => {
    const formatting = { formattedWith: [], problem: null };

    render(<FilePlanSections plan={{ ...PLAN, formatting }} confirmed={[]} onToggle={() => {}} />);

    expect(screen.queryByText(/Formatted with|formatted/i)).toBeNull();
  });

  it("lists a file kept for a file waiting for consent removed once that removal is allowed", () => {
    const waiting: FilePlanSummary = {
      ...PLAN,
      writes: [],
      kept: [
        {
          path: "src/api/pets/store/schemas.ts",
          reason: "imported",
          unless: ["src/api/pets/store/index.ts"],
        },
        { path: "src/api/pets/shared.ts", reason: "imported" },
      ],
      pending: [
        {
          path: "src/api/pets/store/index.ts",
          kind: "remove",
          reason: "edited",
          preselected: false,
        },
      ],
    };
    const note = (region: string, path: string) =>
      within(screen.getByRole("region", { name: region })).getByText(path).parentElement
        ?.textContent;

    const { rerender } = render(
      <FilePlanSections plan={waiting} confirmed={[]} onToggle={() => {}} />,
    );
    const before = note("Left as they are", "src/api/pets/store/schemas.ts");
    rerender(
      <FilePlanSections
        plan={waiting}
        confirmed={["src/api/pets/store/index.ts"]}
        onToggle={() => {}}
      />,
    );

    expect(before).toBe(
      "src/api/pets/store/schemas.tskept unless you allow removing store/index.ts",
    );
    expect(note("Removed, with a copy kept", "src/api/pets/store/schemas.ts")).toBe(
      "src/api/pets/store/schemas.tsremoved with store/index.ts",
    );
    expect(note("Left as they are", "src/api/pets/shared.ts")).toBe(
      "src/api/pets/shared.tsa file that stays imports it",
    );
  });
});
