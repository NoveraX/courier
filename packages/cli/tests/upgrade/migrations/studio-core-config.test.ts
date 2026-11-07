import { describe, expect, it } from "vitest";

import { parseSource } from "../../../src/source/parse-source";
import { programOf } from "../../../src/upgrade/codemod/ast";
import { applyEdits } from "../../../src/upgrade/codemod/text-edits";
import { STUDIO_CORE_CONFIG } from "../../../src/upgrade/migrations/studio-core-config";
import { UNTOLD } from "./migrate-with";

function migrate(text: string) {
  const done = STUDIO_CORE_CONFIG.migrate(
    {
      path: "scripts/x.ts",
      text,
      program: programOf(parseSource("x.ts", text).program),
      kind: "module",
      piece: 0,
    },
    UNTOLD,
  );
  return { text: applyEdits(text, done.edits), packages: done.packages };
}

describe("0.4.0: studio-core's config entry", () => {
  it("loads the config from the build's package, and needs that package beside Studio's runtime", () => {
    const { text, packages } = migrate(
      'import { loadCourierConfig, type LoadedCourierConfig } from "@noverax/courier-studio-core/config";\n',
    );

    expect(text).toBe(
      'import { loadCourierConfig, type LoadedCourierConfig } from "@noverax/courier-build/config";\n',
    );
    expect(packages).toEqual([
      { name: "@noverax/courier-build", beside: "@noverax/courier-studio-core" },
    ]);
  });

  it("takes the mocks file's loader from Studio's mocks entry, and the rest from the build's config", () => {
    const { text, packages } = migrate(
      "import { findMocksFile, loadCourierConfig } from '@noverax/courier-studio-core/config'\n",
    );

    expect(text).toBe(
      "import { loadCourierConfig } from '@noverax/courier-build/config'\nimport { findMocksFile } from '@noverax/courier-studio-core/mocks'\n",
    );
    expect(packages).toHaveLength(1);
  });

  it("moves a file that takes the mocks loader alone, needing no new package, and a require of the entry", () => {
    const mocks = migrate(
      'import { readMocksExport } from "@noverax/courier-studio-core/config";\n',
    );
    const required = migrate(
      'const { loadCourierConfig } = require("@noverax/courier-studio-core/config");\n',
    );

    expect(mocks).toEqual({
      text: 'import { readMocksExport } from "@noverax/courier-studio-core/mocks";\n',
      packages: [],
    });
    expect(required.text).toBe(
      'const { loadCourierConfig } = require("@noverax/courier-build/config");\n',
    );
  });
});
