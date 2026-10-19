/**
 * Where Studio 0.3.0 put an import this release binds otherwise: a source
 * named `eval`, `arguments`, `undefined` or `globalThis` was bound by that
 * very name in a folder of that name, where this release binds it as
 * `evalGroup` in `eval-group/`. Every other import goes where it went.
 */
import { describe, expect, it } from "vitest";

import { formerPlacement } from "../../src/apis/layout/former-placement";
import { resolveImportLayout } from "../../src/apis/layout/import-layout";

describe("formerPlacement", () => {
  it.each([
    ["eval", "src/api/eval"],
    ["arguments", "src/api/arguments"],
    ["undefined", "src/api/undefined"],
    ["globalThis", "src/api/global-this"],
  ])("puts an import named %s where 0.3.0 did, apart from where it goes now", (name, dir) => {
    const placement = { outputDir: "./src/api/" };

    const former = formerPlacement(placement, name);
    const layout = resolveImportLayout(placement, name);

    expect(former).toEqual({ binding: name, dir });
    expect(layout.sourceBinding).toBe(`${name}Group`);
    expect(layout.dir).not.toBe(dir);
  });

  it("names the binding after the source's name before the import's key", () => {
    expect(formerPlacement({ outputDir: "src/api", sourceName: "Global This" }, "flags")).toEqual({
      binding: "globalThis",
      dir: "src/api/global-this",
    });
  });

  it.each(["pets", "evalGroup", "Error", "Undefined Group", "default"])(
    "has none for %s, which this release puts where 0.3.0 did",
    (name) => {
      expect(formerPlacement({ outputDir: "src/api" }, name)).toBeUndefined();
    },
  );
});
