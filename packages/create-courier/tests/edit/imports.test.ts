import { describe, expect, it } from "vitest";

import { importsOf, usesExport, usesOf } from "../../src/edit/imports";
import { type SourceScan, scanSource } from "../../src/edit/source-scan";

function scanned(text: string): SourceScan {
  const scan = scanSource(text);
  if (scan === undefined) throw new Error("the brackets do not pair");
  return scan;
}

function bindingsOf(text: string): Record<string, string[]> {
  return Object.fromEntries(
    importsOf(scanned(text)).map((each) => [
      each.specifier,
      each.bindings.map((binding) => `${binding.imported}:${binding.local}`),
    ]),
  );
}

describe("importsOf", () => {
  it("reads the names a static import binds, and leaves a type-only import out", () => {
    const text = `import config, * as all from "./courier.config";
import { registerSources, attachRuntime as attach, type Source } from "@noverax/courier";
import type { NextConfig } from "next";
import "./side-effect";
`;

    expect(bindingsOf(text)).toEqual({
      "./courier.config": ["default:config", "*:all"],
      "@noverax/courier": ["registerSources:registerSources", "attachRuntime:attach"],
      "./side-effect": [],
    });
  });

  it("reads import() destructured, given a name or followed by .then, and require()", () => {
    const text = `export async function register() {
  const { default: config } = await import("./courier.config");
  const studio = await import("@noverax/courier-studio-core/runtime");
}
import("@noverax/courier-studio-core").then(({ attachRuntime }) => attachRuntime());
const { withCourierStudio } = require("@noverax/courier-studio/next");
`;

    expect(bindingsOf(text)).toEqual({
      "./courier.config": ["default:config"],
      "@noverax/courier-studio-core/runtime": ["*:studio"],
      "@noverax/courier-studio-core": ["attachRuntime:attachRuntime"],
      "@noverax/courier-studio/next": ["withCourierStudio:withCourierStudio"],
    });
  });

  it("reads a long run of spaces after import in a time that grows with its length alone", () => {
    const text = `// import${" ".repeat(20_000)}\nimport { courier } from "./courier";\n`;

    const began = performance.now();
    const bindings = bindingsOf(text);

    expect(performance.now() - began).toBeLessThan(500);
    expect(bindings).toEqual({ "./courier": ["courier:courier"] });
  });

  it("finds the import on the line after a comment that says import", () => {
    const text = `// import the routes first\nimport { courier } from "./courier";\n`;

    expect(bindingsOf(text)).toEqual({ "./courier": ["courier:courier"] });
  });

  it("takes no import written in a comment or a string for one", () => {
    const text = `// import { registerSources } from "@noverax/courier";
/* await import("@noverax/courier-studio-core/runtime") */
const hint = 'import { apiRoute } from "@noverax/courier-next"';
`;

    expect(importsOf(scanned(text))).toEqual([]);
  });
});

describe("usesExport", () => {
  const runtime = (specifier: string) => specifier === "@noverax/courier-studio-core/runtime";

  it("finds a call of the export under the name the file gives it", () => {
    const scan = scanned(
      'import { attachRuntime as attach } from "@noverax/courier-studio-core/runtime";\nawait attach();\n',
    );

    expect(usesExport(scan, importsOf(scan), runtime, "attachRuntime", true)).toBe(true);
  });

  it("finds a call of a member of the module imported whole", () => {
    const scan = scanned(
      'const studio = await import("@noverax/courier-studio-core/runtime");\nawait studio.attachRuntime();\n',
    );

    expect(usesExport(scan, importsOf(scan), runtime, "attachRuntime", true)).toBe(true);
  });

  it("does not count an import alone, a call in a comment, or another object's member", () => {
    const commented = scanned(
      'import { attachRuntime } from "@noverax/courier-studio-core/runtime";\n// await attachRuntime();\nother.attachRuntime();\n',
    );
    const elsewhere = scanned('import { attachRuntime } from "./mine";\nawait attachRuntime();\n');

    expect(usesExport(commented, importsOf(commented), runtime, "attachRuntime", true)).toBe(false);
    expect(usesExport(elsewhere, importsOf(elsewhere), runtime, "attachRuntime", true)).toBe(false);
  });

  it("counts a use that is not a call only where a use is asked for", () => {
    const scan = scanned(
      'import { courierPlugin } from "@noverax/courier-fastify";\nawait app.register(courierPlugin);\n',
    );
    const fastify = (specifier: string) => specifier === "@noverax/courier-fastify";

    expect(usesExport(scan, importsOf(scan), fastify, "courierPlugin", false)).toBe(true);
    expect(usesExport(scan, importsOf(scan), fastify, "courierPlugin", true)).toBe(false);
  });
});

describe("usesOf", () => {
  it("leaves out the name inside the statement that imports it", () => {
    const scan = scanned('import { courierHandler } from "@noverax/courier-hono";\n');

    expect(usesOf(scan, importsOf(scan), "courierHandler", false)).toEqual([]);
  });
});
