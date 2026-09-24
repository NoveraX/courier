import { describe, expect, it } from "vitest";

import { DEFAULT_STYLE } from "../../../src/server/mocks-edit/plan/detect-style";
import { readMockImports } from "../../../src/server/mocks-edit/plan/mock-imports";
import { parseSource } from "../../../src/server/mocks-edit/plan/parse-source";
import type { ImportPlan } from "../../../src/server/mocks-edit/plan/plan-imports";
import { planImports } from "../../../src/server/mocks-edit/plan/plan-imports";

const SPECIFIERS = { preferred: "./courier.config", accepted: ["./courier.config"] };

function plan(text: string, needsDefineMocks = false): ImportPlan {
  const parsed = parseSource("courier.mocks.ts", text);
  return planImports(
    parsed,
    readMockImports(parsed.program),
    SPECIFIERS,
    DEFAULT_STYLE,
    needsDefineMocks,
  );
}

describe("planImports", () => {
  it("plans nothing when the file imports everything", () => {
    const text = `import { defineMockServer } from "@noverax/courier-mock";\nimport c from "./courier.config";\n`;

    expect(plan(text)).toEqual({
      serverCallee: "defineMockServer",
      mocksCallee: null,
      configLocal: "c",
      configSpecifier: "./courier.config",
      edits: [],
      addedStatements: [],
      extendedImport: null,
    });
  });

  it("joins the names it needs to the package's import, and claims the extension", () => {
    const text = `import { type MockServerDefinition } from "@noverax/courier-mock";\nimport c from "./courier.config";\n`;

    expect(plan(text, true)).toEqual({
      serverCallee: "defineMockServer",
      mocksCallee: "defineMocks",
      configLocal: "c",
      configSpecifier: "./courier.config",
      edits: [
        {
          start: text.indexOf(" }"),
          end: text.indexOf(" }"),
          text: ", defineMocks, defineMockServer",
        },
      ],
      addedStatements: [],
      extendedImport: { start: 0, names: ["defineMocks", "defineMockServer"] },
    });
  });

  it("writes new import lines and claims them as added statements", () => {
    expect(plan("export default {};\n")).toEqual({
      serverCallee: "defineMockServer",
      mocksCallee: null,
      configLocal: "courierConfig",
      configSpecifier: "./courier.config",
      edits: [
        {
          start: 0,
          end: 0,
          text: `import { defineMockServer } from "@noverax/courier-mock";\nimport courierConfig from "./courier.config";\n\n`,
        },
      ],
      addedStatements: [
        `import { defineMockServer } from "@noverax/courier-mock";`,
        `import courierConfig from "./courier.config";`,
      ],
      extendedImport: null,
    });
  });

  it("leaves defineMocks alone when the file has a default export", () => {
    const text = `import { defineMocks as dm } from "./legacy";\nexport default {};\n`;

    expect(plan(text).mocksCallee).toBeNull();
  });

  it("refuses defineMocks when the file must import it but binds the name elsewhere", () => {
    const text = `import { defineMocks } from "./legacy";\nimport config from "./courier.config";\n`;

    expect(() => plan(text, true)).toThrow(
      "courier.mocks.ts already declares defineMocks on line 1, so Studio cannot import defineMocks from @noverax/courier-mock under that name.",
    );
  });

  it("reuses what it can and imports only what is missing", () => {
    const text = `import * as mock from "@noverax/courier-mock/managed";\n`;

    expect(plan(text, true)).toMatchObject({
      serverCallee: "mock.defineMockServer",
      mocksCallee: "mock.defineMocks",
      addedStatements: [`import courierConfig from "./courier.config";`],
    });
  });
});
