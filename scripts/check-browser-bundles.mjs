/// <reference types="node" />
/**
 * Check what a page takes from Courier, built as an app's bundler builds it
 * for production, from the packages as they are published.
 *
 * Each scenario is one the documentation shows for a page
 * (`browser-bundles/scenarios.mjs`). For each:
 *
 *  - no built-in module of Node is reached, at start or later;
 *  - what loads at start stays within its budget, minified and gzipped;
 *  - no browser API newer than the browsers the requirements name —
 *    Safari 15.4, Chrome 97, Firefox 104 — nor one a page served over plain
 *    HTTP lacks, is called where its module does not check for it first.
 *
 * Requires a build first. Exits 1 with each breach.
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { builtinModules, createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { argv } from "node:process";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

import { newerApiCalls } from "./browser-bundles/newer-api-calls.mjs";
import { PROVIDED, SCENARIOS } from "./browser-bundles/scenarios.mjs";
import { startClosure } from "./browser-bundles/start-closure.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const KIB = 1024;

const isBuiltin = (path) => path.startsWith("node:") || builtinModules.includes(path.split("/")[0]);

function build(esbuild, work, scenario, options) {
  const entry = join(work, `${scenario.name.replace(/\W+/g, "-")}.js`);
  writeFileSync(entry, scenario.code);
  const result = esbuild.buildSync({
    entryPoints: [entry],
    bundle: true,
    write: false,
    metafile: true,
    outdir: join(work, "out"),
    tsconfig: join(work, "tsconfig.json"),
    platform: "browser",
    format: "esm",
    define: { "process.env.NODE_ENV": '"production"' },
    external: [...PROVIDED, "node:*", ...builtinModules],
    logLevel: "silent",
    ...options,
  });
  return { result, entry: relative(process.cwd(), entry) };
}

function measure(esbuild, work, scenario) {
  const { result, entry } = build(esbuild, work, scenario, { minify: true, splitting: true });
  const outputs = result.metafile.outputs;
  /* A chunk a dynamic import loads is an entry point of its own too: the page's is the scenario's. */
  const page = Object.keys(outputs).find((path) => outputs[path].entryPoint === entry);
  const start = startClosure(outputs, page);
  const code = result.outputFiles
    .filter((file) => [...start].some((path) => resolve(path) === file.path))
    .map((file) => file.text)
    .join("");
  const builtins = Object.values(result.metafile.inputs)
    .flatMap((input) => input.imports)
    .filter((imported) => imported.external && isBuiltin(imported.path))
    .map((imported) => imported.path);
  return { bytes: code.length, gzipped: gzipSync(code).length, builtins: [...new Set(builtins)] };
}

/* What a scenario breaches: a built-in module it reaches, its budget, a newer API it calls unchecked. */
function breachesOf(esbuild, work, scenario) {
  const { bytes, gzipped, builtins } = measure(esbuild, work, scenario);
  const [budget, budgetGzipped] = scenario.budget;
  const size = `${(bytes / KIB).toFixed(1)} KiB, ${(gzipped / KIB).toFixed(1)} KiB gzipped`;
  console.log(
    `check-browser-bundles: ${scenario.name} — ${size} at start (budget ${budget}, ${budgetGzipped})`,
  );
  const breaches = builtins.map(
    (builtin) => `${scenario.name} reaches ${builtin}, which no browser has`,
  );
  if (bytes > budget * KIB || gzipped > budgetGzipped * KIB) {
    breaches.push(
      `${scenario.name} loads ${size} at start, over its budget of ${budget} KiB, ${budgetGzipped} KiB gzipped`,
    );
  }
  const whole = build(esbuild, work, scenario, { minify: false, splitting: false }).result;
  for (const call of newerApiCalls(whole.outputFiles[0]?.text ?? "")) {
    breaches.push(
      `${call.module} calls ${call.api}, which ${call.lacking} lack, without checking for it first`,
    );
  }
  return breaches;
}

function main() {
  const esbuild = createRequire(join(ROOT, "package.json"))("esbuild");
  const work = join(ROOT, "node_modules/.cache/courier-browser-bundles");
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  writeFileSync(join(work, "tsconfig.json"), "{}");
  const breaches = SCENARIOS.flatMap((scenario) => breachesOf(esbuild, work, scenario));
  rmSync(work, { recursive: true, force: true });
  const unique = [...new Set(breaches)];
  if (unique.length === 0) return;
  console.error(`\ncheck-browser-bundles: ${unique.length} breach(es)\n${unique.join("\n")}`);
  process.exit(1);
}

if (argv[1] && resolve(argv[1]) === resolve(fileURLToPath(import.meta.url))) main();
