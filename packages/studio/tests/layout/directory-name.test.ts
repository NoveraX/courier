import { describe, expect, it } from "vitest";
import { directoryName } from "../../src/apis/layout/directory-name";

describe("directoryName", () => {
  it("names a binding's directory in kebab case", () => {
    expect(directoryName("pets")).toBe("pets");
    expect(directoryName("webHooks")).toBe("web-hooks");
    expect(directoryName("v2Users")).toBe("v2-users");
    expect(directoryName("_3D")).toBe("_3-d");
  });

  it("gives bindings that differ only in letter case directories that differ ignoring case", () => {
    const bindings = ["webhooks", "webHooks", "webHOoks", "aB", "ab", "_3d", "_3D"];

    const folded = bindings.map((binding) => directoryName(binding).toLowerCase());

    expect(new Set(folded).size).toBe(bindings.length);
  });

  it("moves a name Windows reserves for a device out of the way", () => {
    for (const device of ["con", "prn", "aux", "nul", "com1", "lpt9"]) {
      expect(directoryName(device)).toBe(`_${device}`);
    }
    expect(directoryName("console")).toBe("console");
  });
});
