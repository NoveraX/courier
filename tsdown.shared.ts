import type { UserConfig } from "tsdown";

/**
 * Build options every published package shares.
 *
 * Declarations are bundled per entry with shared chunks, which is the shape
 * the seventeen `exports` maps point at.
 *
 * `oxc` derives them from isolated declarations in Rust, so the build never
 * loads the TypeScript compiler API — the thing that has no replacement in
 * TypeScript 7. `generator` is pinned rather than left to tsdown's inference,
 * which picks one from whatever TypeScript happens to be installed; a release
 * should not change how it emits types because someone upgraded a compiler.
 */
export const sharedBuild = {
  outDir: "lib",
  format: ["esm"],
  dts: { generator: "oxc" },
  clean: true,
  /* Every package is "type": "module", so plain .js/.d.ts is unambiguous —
     and it is what the `exports` maps already name. */
  outExtensions: () => ({ js: ".js", dts: ".d.ts" }),
} satisfies UserConfig;
