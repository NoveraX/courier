/**
 * A request whose progress reporting did not load, as a page's bundle has
 * it: an upload goes as any body does, and a download uncounted, said once
 * a page. A page's form holds no device's file, so nothing is refused.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { withoutProgress } from "../../../src/browser/utils/without-progress";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("a request without its progress, in a page", () => {
  it("is said once, and never refused", () => {
    const warned = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const cause = new Error("Failed to fetch dynamically imported module");

    expect(() => withoutProgress(cause, new FormData())).not.toThrow();
    expect(() => withoutProgress(cause, { uri: "file:///photo.jpg" })).not.toThrow();
    expect(() => withoutProgress(cause)).not.toThrow();

    const said = warned.mock.calls.filter((args) =>
      args.join(" ").includes("progress reporting did not load"),
    );
    expect(said).toHaveLength(1);
  });
});
