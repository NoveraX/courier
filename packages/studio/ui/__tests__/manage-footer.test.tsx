/**
 * @vitest-environment jsdom
 */
/**
 * The manage dialog's footer says what applying the plan does to the files:
 * those it writes — not those it only records — and those it removes, as
 * the note after applying says it was done. It counted the files written
 * alone, and called a plan removing two of four "2 files touched".
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { UseManageReturn } from "@/apis/use-manage";
import type { FilePlanSummary } from "@/features/apis/types-file-plan";
import { ManageFooter } from "@/screens/apis/manage/manage-footer";

afterEach(cleanup);

const NOTHING = { content: "", parsing: false, error: null };

/* The manage flow on its review step, with the plan Studio previewed. */
function reviewing(plan: Partial<FilePlanSummary>): UseManageReturn {
  const whole: FilePlanSummary = {
    digest: "d1",
    dir: "src/api/weather",
    writes: [],
    removals: [],
    kept: [],
    pending: [],
    blocked: [],
    forgotten: [],
    ...plan,
  };
  const flow: Partial<UseManageReturn> = {
    step: "preview",
    importType: "raw",
    consent: { plan: whole, confirmed: [] },
    toAdd: {},
    toRemove: {},
    close: () => {},
    back: () => {},
    apply: async () => {},
    requestPreview: async () => {},
  };
  return flow as UseManageReturn;
}

describe("the manage footer on the review step", () => {
  it("counts the files the plan writes and those it removes", () => {
    const plan = reviewing({
      writes: [
        { path: "source.ts", action: "merge", was: "recorded" },
        { path: "index.ts", action: "merge", was: "recorded" },
        { path: "schemas.ts", action: "unchanged", was: "recorded" },
      ],
      removals: [
        { path: "stations/index.ts", was: "recorded" },
        { path: "stations/schemas.ts", was: "recorded" },
      ],
    });

    render(<ManageFooter manage={plan} reupload={NOTHING} onReupload={() => {}} />);

    expect(screen.getByText("2 files to write, 2 to remove")).toBeTruthy();
  });

  it("names one file written alone, when the plan removes none", () => {
    const plan = reviewing({ writes: [{ path: "source.ts", action: "create", was: "absent" }] });

    render(<ManageFooter manage={plan} reupload={NOTHING} onReupload={() => {}} />);

    expect(screen.getByText("1 file to write")).toBeTruthy();
  });
});
