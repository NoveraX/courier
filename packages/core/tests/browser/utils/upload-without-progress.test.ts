/**
 * An upload whose progress reporting did not load, as a page's bundle has
 * it: it goes as any body does, said once a page. A page's form holds no
 * device's file, so nothing is refused.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { uploadWithoutProgress } from "../../../src/browser/utils/upload-without-progress";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("an upload without its progress, in a page", () => {
  it("is said once, and never refused", () => {
    const warned = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const cause = new Error("Failed to fetch dynamically imported module");

    expect(() => uploadWithoutProgress(new FormData(), cause)).not.toThrow();
    expect(() => uploadWithoutProgress({ uri: "file:///photo.jpg" }, cause)).not.toThrow();

    const said = warned.mock.calls.filter((args) =>
      args.join(" ").includes("upload progress did not load"),
    );
    expect(said).toHaveLength(1);
  });
});
