/**
 * The palette's first action says what it does: pause, resume, or — while
 * a saved session shows — go back to the live requests; and a session
 * file can be shared or opened from it.
 */
import { describe, expect, it } from "vitest";

import { paletteEntries } from "@/shell/command-palette/palette-entries";

function labels(recording: "recording" | "paused" | "session"): string[] {
  return paletteEntries([], recording, "har")
    .filter((entry) => entry.group === "Actions")
    .map((entry) => entry.label);
}

describe("the palette's actions", () => {
  it("name the recording action by what it does now", () => {
    expect([labels("recording")[0], labels("paused")[0], labels("session")[0]]).toEqual([
      "Pause recording",
      "Resume recording",
      "Back to live requests",
    ]);
  });

  it("share the requests as a session file, and open one", () => {
    expect(labels("recording")).toEqual(
      expect.arrayContaining(["Share as a session file", "Open a session file"]),
    );
  });
});
