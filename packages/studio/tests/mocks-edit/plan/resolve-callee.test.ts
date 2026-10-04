import { describe, expect, it } from "vitest";
import { collectModuleBindings } from "../../../src/server/mocks-edit/plan/module-bindings";
import { parseSource } from "../../../src/server/mocks-edit/plan/parse-source";
import { readMockImports } from "../../../src/server/mocks-edit/plan/read-mock-imports";
import type { CalleeResolution } from "../../../src/server/mocks-edit/plan/resolve-callee";
import { resolveCallee } from "../../../src/server/mocks-edit/plan/resolve-callee";

function resolve(text: string, name = "defineMockServer"): CalleeResolution {
  const { program } = parseSource("x.ts", text);
  return resolveCallee(name, readMockImports(program), collectModuleBindings(program));
}

describe("resolveCallee", () => {
  it("reuses a named value import under its alias", () => {
    expect(
      resolve(`import { defineMockServer as server } from "@noverax/courier-mock/managed";`),
    ).toEqual({
      kind: "imported",
      callee: "server",
    });
  });

  it("prefers a named import to a namespace", () => {
    const text = `import * as mock from "@noverax/courier-mock";\nimport { defineMockServer } from "@noverax/courier-mock";`;

    expect(resolve(text)).toEqual({ kind: "imported", callee: "defineMockServer" });
  });

  it("calls through a namespace import", () => {
    expect(resolve(`import * as mock from "@noverax/courier-mock";`)).toEqual({
      kind: "imported",
      callee: "mock.defineMockServer",
    });
  });

  it("imports the name when nothing holds it", () => {
    expect(resolve(`import { defineMocks } from "@noverax/courier-mock";`)).toEqual({
      kind: "free",
      callee: "defineMockServer",
    });
  });

  it("reports where a local declaration holds the name", () => {
    const text = "const a = 1;\nconst defineMockServer = a;\n";

    expect(resolve(text)).toEqual({ kind: "taken", offset: text.indexOf("defineMockServer") });
  });

  it("reports a type-only import or another package's import as holding the name", () => {
    expect(resolve(`import type { defineMockServer } from "@noverax/courier-mock";`)).toEqual({
      kind: "taken",
      offset: 14,
    });
    expect(resolve(`import { defineMockServer } from "./local";`)).toEqual({
      kind: "taken",
      offset: 9,
    });
  });
});
