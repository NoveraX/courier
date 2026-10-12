/**
 * What a phone's Timeline bar keeps in its "⋯" menu: Preserve log, ticked
 * while on, Clear, and what the requests become — each output off while
 * there are no requests, and each doing what the bar's button does.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { timelineMenu } from "@/screens/timeline/timeline-menu";
import { outputsOf } from "@/screens/timeline/timeline-outputs";

const outputs = vi.hoisted(() => ({
  exportShownRequests: vi.fn(async () => {}),
  shareSessionFile: vi.fn(),
  saveAsTest: vi.fn(),
}));
vi.mock("@/features/sessions/export-requests", () => ({
  exportShownRequests: outputs.exportShownRequests,
}));
vi.mock("@/features/sessions/session-file-dialog-store", () => ({
  shareSessionFile: outputs.shareSessionFile,
}));
vi.mock("@/features/tests/recorded-test-store", () => ({ saveAsTest: outputs.saveAsTest }));

const input = (fields: Partial<Parameters<typeof timelineMenu>[0]> = {}) => ({
  preserve: false,
  onPreserve: vi.fn(),
  onClear: vi.fn(),
  total: 12,
  format: "har" as const,
  ...fields,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("timelineMenu", () => {
  it("lists the bar's actions in its order, the export named with its format", () => {
    const labels = timelineMenu(input()).map((action) => action.label);

    expect(labels).toEqual([
      "Preserve log",
      "Clear",
      "Export as HAR",
      "Share as a session file",
      "Save as test",
    ]);
  });

  it("ticks Preserve log while it is on, and marks Clear as discarding", () => {
    const [preserve, clear] = timelineMenu(input({ preserve: true }));

    expect(preserve?.checked).toBe(true);
    expect(timelineMenu(input())[0]?.checked).toBe(false);
    expect(clear?.tone).toBe("danger");
  });

  it("turns Preserve log and clears through the bar's own handlers", () => {
    const given = input();
    const [preserve, clear] = timelineMenu(given);

    preserve?.onSelect();
    clear?.onSelect();

    expect(given.onPreserve).toHaveBeenCalledOnce();
    expect(given.onClear).toHaveBeenCalledOnce();
  });

  it("keeps the outputs off while there are no requests, and Clear on", () => {
    const actions = timelineMenu(input({ total: 0 }));

    expect(actions.filter((a) => a.disabled === true).map((a) => a.key)).toEqual([
      "export",
      "share",
      "test",
    ]);
  });

  it("exports, shares and saves the requests shown, as the bar's buttons do", () => {
    const [, , exported, shared, saved] = timelineMenu(input({ format: "json" }));

    exported?.onSelect();
    shared?.onSelect();
    saved?.onSelect();

    expect(outputs.exportShownRequests).toHaveBeenCalledWith("json");
    expect(outputs.shareSessionFile).toHaveBeenCalledWith({ kind: "shown" });
    expect(outputs.saveAsTest).toHaveBeenCalledWith({ kind: "shown" });
  });
});

describe("outputsOf", () => {
  it("names each output for its button, its menu item and its tooltip", () => {
    const [exported] = outputsOf("har");

    expect(exported).toMatchObject({
      label: "Export",
      menuLabel: "Export as HAR",
      title: "Export the requests as HAR",
    });
  });
});
