import { describe, expect, it } from "vitest";
import { directoryName } from "../../src/apis/layout/directory-name";
import { isWindowsDevice } from "../../src/apis/layout/windows-device";
import { seededRandom } from "../helpers/seeded-random";

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

  it("gives two identifiers one folder only as a device's name and its escape, on 20 000 random ones", () => {
    const alphabet = "abcnolprtuxABCNOLPRTUX0123456789_$";
    const devices = ["con", "prn", "aux", "nul", "com1", "lpt9", "conin$"];
    const next = seededRandom(7);
    const names = new Set(devices.flatMap((device) => [device, `_${device}`]));
    while (names.size < 20_000) {
      const word = Array.from({ length: 1 + next(6) }, () => alphabet[next(alphabet.length)]).join(
        "",
      );
      if (/^[A-Za-z_$]/.test(word)) names.add(word);
    }
    const byFolder = new Map<string, string[]>();
    for (const name of names)
      byFolder.set(directoryName(name), [...(byFolder.get(directoryName(name)) ?? []), name]);

    for (const [folder, sharing] of byFolder) {
      if (sharing.length === 1) continue;
      const device = folder.slice(1);
      expect(isWindowsDevice(device)).toBe(true);
      expect(sharing.sort()).toEqual([`_${device}`, device].sort());
    }
  });
});
