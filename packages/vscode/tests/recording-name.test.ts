import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { recordingName } from "../src/testing/recording-name";

describe("recordingName", () => {
  it("names a recording relative to its project with forward slashes, as verify reports it", () => {
    const root = join("work", "shop");

    expect(recordingName(root, join(root, "tests", "recorded", "checkout.har"))).toBe(
      "tests/recorded/checkout.har",
    );
  });
});
