import { parseSource } from "@noverax/courier-cli/devkit";
import { describe, expect, it } from "vitest";
import { collectModuleBindings } from "../../../src/server/mocks-edit/plan/module-bindings";

function namesIn(text: string): string[] {
  return [...collectModuleBindings(parseSource("x.ts", text).program).keys()];
}

describe("collectModuleBindings", () => {
  it("binds every import's local names, type-only ones included", () => {
    const text = `import a, { b as c, type d } from "m";\nimport * as e from "n";\nimport type f from "o";\n`;

    expect(namesIn(text)).toEqual(["a", "c", "d", "e", "f"]);
  });

  it("binds variables through destructuring patterns", () => {
    const text = "const { a, b: [c, , ...d], e = 1, ...f } = o;\nlet g;\nvar [h = 2] = p;\n";

    expect(namesIn(text)).toEqual(["a", "c", "d", "e", "f", "g", "h"]);
  });

  it("binds functions, classes, enums, namespaces, type aliases and interfaces", () => {
    const text = [
      "function a() {}",
      "class B {}",
      "enum C { X }",
      "namespace D.E {}",
      "type F = 1;",
      "interface G {}",
      "declare function h(): void;",
      `import i = require("m");`,
    ].join("\n");

    expect(namesIn(text)).toEqual(["a", "B", "C", "D", "F", "G", "h", "i"]);
  });

  it("binds exported declarations and a named default export", () => {
    const text = "export const a = 1;\nexport function b() {}\nexport default class C {}\n";

    expect(namesIn(text)).toEqual(["a", "b", "C"]);
  });

  it("binds nothing for declare global, ambient modules or expressions", () => {
    const text = `declare global {}\ndeclare module "m" {}\nexport default {};\nx = 1;\n`;

    expect(namesIn(text)).toEqual([]);
  });

  it.each<[string, string, string[]]>([
    ["an if/else", "if (x) {\n  var a = 1;\n} else var b = 2;\n", ["a", "b"]],
    [
      "try, catch and finally",
      "try {\n  var a;\n} catch (e) {\n  var b;\n} finally {\n  var c;\n}\n",
      ["a", "b", "c"],
    ],
    [
      "for heads and bodies",
      "for (var a = 0; ; ) { var b; }\nfor (var c in o) {}\nfor (var d of o) {}\n",
      ["a", "b", "c", "d"],
    ],
    ["while and do-while", "while (x) { var a; }\ndo { var b; } while (x);\n", ["a", "b"]],
    [
      "switch cases and labels",
      "switch (x) {\n  case 1:\n    var a;\n}\nlabel: { var b; }\n",
      ["a", "b"],
    ],
    ["nested blocks", "{ { if (x) { var a; } } }\n{ var b; }\n", ["a", "b"]],
  ])("binds a var hoisted to the module out of %s", (_where, text, names) => {
    expect(namesIn(text)).toEqual(names);
  });

  it("binds a hoisted var through its destructuring pattern", () => {
    expect(namesIn("if (x) { var { a, b: [c] } = o; }\n")).toEqual(["a", "c"]);
  });

  it("leaves out block-scoped declarations and anything inside a function or class", () => {
    const text = [
      "if (x) { let a; const b = 1; function c() {} class D {} }",
      "function e() { var f; }",
      "const g = () => { var h; };",
      "class I { static { var j; } m() { var k; } }",
      "for (let l of o) {}",
      "try {} catch (m) {}",
    ].join("\n");

    expect(namesIn(text)).toEqual(["e", "g", "I"]);
  });

  it("records where each name is first declared", () => {
    const text = "const a = 1;\nfunction b() {}\n";

    const bindings = collectModuleBindings(parseSource("x.ts", text).program);

    expect([...bindings]).toEqual([
      ["a", text.indexOf("a =")],
      ["b", text.indexOf("b()")],
    ]);
  });
});
