/**
 * @vitest-environment jsdom
 */
/**
 * The manage dialog says what is true of the files and the spec: a merged
 * file keeps edits only when it holds some, and one new endpoint is one
 * endpoint.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { FilePlanView } from "../src/views/apis/file-plan-view";
import { ManageInventoryView } from "../src/views/apis/manage-inventory";
import type { EndpointInventory } from "../src/views/apis/types";
import type { FilePlanSummary } from "../src/views/apis/types-file-plan";

const PLAN: FilePlanSummary = {
  digest: "plan-1",
  dir: "src/api/pets",
  writes: [
    { path: "src/api/pets/pets/index.ts", action: "merge", was: "recorded" },
    { path: "src/api/pets/store/index.ts", action: "merge", was: "recorded-edited" },
  ],
  removals: [],
  kept: [],
  pending: [],
  blocked: [],
  forgotten: [],
};

const INVENTORY: EndpointInventory = {
  groups: [],
  specChanged: true,
  totalActive: 3,
  totalAvailable: 1,
  totalCustom: 0,
};

afterEach(() => cleanup());

describe("the manage dialog's wording", () => {
  it("says a merge kept edits only for a file that holds some", () => {
    render(<FilePlanView plan={PLAN} confirmed={[]} onToggle={() => {}} />);

    const [untouched, edited] = screen.getAllByRole("listitem");
    expect(untouched?.textContent).toBe("src/api/pets/pets/index.tsmerged");
    expect(edited?.textContent).toBe("src/api/pets/store/index.tsmerged, your edits kept");
  });

  it("counts one new endpoint as one endpoint", () => {
    render(
      <ManageInventoryView
        inventory={INVENTORY}
        toAdd={{}}
        toRemove={{}}
        onToggle={() => {}}
        onToggleGroup={() => {}}
        onToggleAll={() => {}}
      />,
    );

    expect(screen.getByText(/Spec has changed/).textContent).toBe(
      "Spec has changed — 1 new endpoint available",
    );
  });
});
