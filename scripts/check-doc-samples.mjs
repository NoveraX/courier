#!/usr/bin/env node
/// <reference types="node" />
/**
 * Fail when a TypeScript sample of the docs or a README does not compile
 * against the packages as they are built.
 *
 * Each ts or tsx fence becomes a module of its own. A sample may leave out
 * what is not its point — the reader's own `users` group, a helper, an
 * import — so names it uses without declaring them are not reported, and
 * the reader's own modules (`@/…`, relative paths) are typed as anything. A
 * name one of the packages exports is imported for it instead, so what a
 * fragment does with the package is checked all the same. Everything a
 * sample takes from the packages has to compile: a removed function, a
 * renamed option, a wrong argument count, a type the entry does not export.
 *
 * The documentation described middleware as one function argument for a
 * year after it took three, and a signature, an option list and a return
 * type each drifted the same way.
 *
 * Exits 1 with a list of places when found.
 */

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, relative, resolve } from "node:path";
import { argv, exit } from "node:process";
import { fileURLToPath } from "node:url";

import { extractSamples, importHeader, samplePages } from "./doc-samples.mjs";
import { placeSamples } from "./page-modules.mjs";
import { isOmission, samplesLeavingOut } from "./sample-omissions.mjs";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
/* Inside node_modules, so the samples resolve the packages as a reader's code would. */
const OUT = join(ROOT, "node_modules/.cache/courier-doc-samples");

/** The public entries, most specific first: a name two of them export is imported from the first. */
export const ENTRIES = [
  "@noverax/courier/define",
  "@noverax/courier/middleware",
  "@noverax/courier/realtime",
  "@noverax/courier/testing",
  "@noverax/courier/node",
  "@noverax/courier/config",
  "@noverax/courier/fetch",
  "@noverax/courier",
  "@noverax/courier-react",
  "@noverax/courier-next",
  "@noverax/courier-server",
  "@noverax/courier-redis",
  "@noverax/courier-mock",
  "@noverax/courier-mock/testing",
  "@noverax/courier-express",
  "@noverax/courier-fastify",
  "@noverax/courier-hono",
  "@noverax/courier-nestjs",
  "@noverax/courier-nuxt",
  "@noverax/courier-remix",
  "@noverax/courier-solid",
  "@noverax/courier-sveltekit",
  "@noverax/courier-astro",
];

export const OPTIONS = {
  strict: true,
  noEmit: true,
  skipLibCheck: true,
  jsx: ts.JsxEmit.ReactJSX,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  target: ts.ScriptTarget.ES2022,
  lib: ["lib.es2023.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"],
  types: ["node"],
  resolveJsonModule: true,
};

/**
 * Compile samples and list what does not compile.
 *
 * @param {Array<{ page: string, line: number, jsx: boolean, code: string }>} samples - The samples, each with the page it came from
 * @returns {string[]} One `page:line TScode message` per problem
 * @example
 * checkSamples([{ page: "docs/a.mdx", line: 3, jsx: false, code: 'import { defineApi } from "@noverax/courier/define"\ndefineApi()\n' }]);
 * // → ["docs/a.mdx:4 TS2554 Expected 1 arguments, but got 0."]
 */
export function checkSamples(samples) {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  const app = join(OUT, "app-modules.d.ts");
  writeFileSync(app, 'declare module "@/*";\ndeclare module "~/*";\ndeclare module "*.css";\n');
  const files = placeSamples(samples, OUT);
  for (const [file, sample] of files) {
    const module = /^\s*(import|export)\s/m.test(sample.code) ? "" : "\nexport {};\n";
    writeFileSync(file, sample.code + module);
  }
  const roots = [...files.keys(), app];
  const shifts = addMissingImports(roots, exportedNames());
  const problems = [];
  const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram(roots, OPTIONS));
  const leavingOut = samplesLeavingOut(diagnostics);
  for (const diagnostic of diagnostics) {
    const sample = diagnostic.file && files.get(diagnostic.file.fileName);
    if (!sample) continue;
    const text = ts.flattenDiagnosticMessageText(diagnostic.messageText, " ");
    const standIn = sample.unresolved || leavingOut.has(diagnostic.file.fileName);
    if (isOmission(diagnostic.code, text, { ...sample, standIn })) continue;
    const { line } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start ?? 0);
    const shift = shifts.get(diagnostic.file.fileName) ?? 0;
    problems.push(
      `${sample.page}:${sample.line + Math.max(0, line - shift)} TS${diagnostic.code} ${text}`,
    );
  }
  rmSync(OUT, { recursive: true, force: true });
  return problems;
}

/* Which entry exports each name, read off the built declarations. */
function exportedNames() {
  const probe = join(OUT, "entries.ts");
  writeFileSync(probe, ENTRIES.map((entry, n) => `import * as m${n} from "${entry}";`).join("\n"));
  const program = ts.createProgram([probe], OPTIONS);
  const checker = program.getTypeChecker();
  const exported = new Map();
  for (const statement of program.getSourceFile(probe)?.statements ?? []) {
    const symbol = checker.getSymbolAtLocation(statement.moduleSpecifier);
    for (const name of symbol ? checker.getExportsOfModule(symbol) : []) {
      if (!exported.has(name.name)) exported.set(name.name, statement.moduleSpecifier.text);
    }
  }
  return exported;
}

/* Give each sample the imports of the package names it uses; how many lines each got. */
function addMissingImports(roots, exported) {
  const missing = new Map();
  for (const diagnostic of ts.getPreEmitDiagnostics(ts.createProgram(roots, OPTIONS))) {
    if ((diagnostic.code !== 2304 && diagnostic.code !== 2552) || !diagnostic.file) continue;
    const text = ts.flattenDiagnosticMessageText(diagnostic.messageText, " ");
    const name = /Cannot find name '([^']+)'/.exec(text)?.[1];
    if (name)
      missing.set(diagnostic.file.fileName, [
        ...(missing.get(diagnostic.file.fileName) ?? []),
        name,
      ]);
  }
  const shifts = new Map();
  for (const [file, names] of missing) {
    const header = importHeader(names, exported);
    if (header.length === 0) continue;
    writeFileSync(file, `${header.join("\n")}\n${readFileSync(file, "utf8")}`);
    shifts.set(file, header.length);
  }
  return shifts;
}

function main() {
  const samples = samplePages(ROOT).flatMap((page) =>
    extractSamples(readFileSync(page, "utf8")).map((sample) => ({
      ...sample,
      page: relative(ROOT, page),
    })),
  );
  const problems = checkSamples(samples);
  if (problems.length === 0) {
    console.log(`check-doc-samples: all ${samples.length} samples compile`);
    return;
  }
  console.error(`check-doc-samples: ${problems.length} problem(s) in ${samples.length} samples\n`);
  for (const problem of problems) console.error(`  ${problem}`);
  exit(1);
}

if (argv[1] && resolve(argv[1]) === resolve(fileURLToPath(import.meta.url))) main();
