import { describe, expect, it } from "vitest";

import { codeStyleOf, namedImport, quoted } from "../../src/edit/code-style";

describe("codeStyleOf", () => {
  it("reads single quotes and no semicolons from an import", () => {
    expect(codeStyleOf("import react from '@vitejs/plugin-react'\n")).toEqual({
      quote: "'",
      semi: false,
    });
  });

  it("reads double quotes and semicolons from an import", () => {
    expect(codeStyleOf('import { defineConfig } from "vite";\n')).toEqual({
      quote: '"',
      semi: true,
    });
  });

  it("reads a file without imports by its first string and its line ends", () => {
    const nuxt =
      "// https://nuxt.com/docs\nexport default defineNuxtConfig({\n  compatibilityDate: '2025-07-15'\n})\n";

    expect(codeStyleOf(nuxt)).toEqual({ quote: "'", semi: false });
  });

  it("writes an import and a string in the style", () => {
    expect(namedImport({ quote: "'", semi: false }, ["a", "b"], "m")).toBe(
      "import { a, b } from 'm'",
    );
    expect(quoted({ quote: '"', semi: true }, "x")).toBe('"x"');
  });
});
