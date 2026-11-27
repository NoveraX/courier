/**
 * A page's form never holds a file named by where it is on the device:
 * only a React Native app's does, and a page's bundle takes a check that
 * answers so without looking through the form.
 */
import { describe, expect, it } from "vitest";

import { holdsDeviceFiles } from "../../../src/browser/utils/device-files";

describe("a page's form", () => {
  it("holds no file on the device, whatever it was given", () => {
    const form = new FormData();
    form.append("note", new Blob(["hello"], { type: "text/plain" }), "note.txt");
    form.append("photo", { uri: "file:///photo.jpg" } as unknown as Blob);

    expect(holdsDeviceFiles(form)).toBe(false);
    expect(holdsDeviceFiles({ uri: "file:///photo.jpg" })).toBe(false);
  });
});
