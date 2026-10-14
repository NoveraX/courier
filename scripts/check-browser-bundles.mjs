/// <reference types="node" />
/**
 * Check what a page takes from Courier, built as an app's bundler builds it
 * for production, from the packages as they are published.
 *
 * Each scenario is one the documentation shows for a page
 * (`browser-bundles/scenarios.mjs`). For each:
 *
 *  - no built-in module of Node is reached, at start or later;
 *  - no module only a server runs is taken as it is, where its browser
 *    stand-in belongs;
 *  - what loads at start stays within its budget, minified and gzipped;
 *  - no browser API newer than the browsers the requirements name —
 *    Safari 15.4, Chrome 97, Firefox 104 — nor one a page served over plain
 *    HTTP lacks, is called where its module does not check for it first.
 *
 * And the direct caller, built for Node, an edge runtime and React Native,
 * takes those modules as they are, never the browser's stand-ins.
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
import { serverOnlyModules } from "./browser-bundles/server-only-modules.mjs";
import { sidesTaken } from "./browser-bundles/sides-taken.mjs";
import { startClosure } from "./browser-bundles/start-closure.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const KIB = 1024;
const SERVER_ONLY = serverOnlyModules(join(ROOT, "packages/core/lib"));

/* Where code runs on a server or in an app, as their bundlers resolve a package: none of them a page. */
const RUNTIMES = [
  { name: "Node", options: { platform: "node" } },
  {
    name: "Next.js's edge runtime",
    options: { platform: "neutral", conditions: ["edge-light", "worker", "browser"] },
  },
  {
    name: "Cloudflare Workers",
    options: { platform: "neutral", conditions: ["workerd", "worker", "browser"] },
  },
  { name: "React Native", options: { platform: "neutral", conditions: ["react-native"] } },
];

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
  return {
    bytes: code.length,
    gzipped: gzipSync(code).length,
    builtins: [...new Set(builtins)],
    inputs: Object.keys(result.metafile.inputs),
  };
}

/* What a scenario breaches: a built-in module it reaches, a module only a server runs, its budget,
   a newer API it calls unchecked. */
function breachesOf(esbuild, work, scenario) {
  const { bytes, gzipped, builtins, inputs } = measure(esbuild, work, scenario);
  const [budget, budgetGzipped] = scenario.budget;
  const size = `${(bytes / KIB).toFixed(1)} KiB, ${(gzipped / KIB).toFixed(1)} KiB gzipped`;
  console.log(
    `check-browser-bundles: ${scenario.name} — ${size} at start (budget ${budget}, ${budgetGzipped})`,
  );
  const breaches = builtins.map(
    (builtin) => `${scenario.name} reaches ${builtin}, which no browser has`,
  );
  for (const module of sidesTaken(inputs, SERVER_ONLY).server) {
    breaches.push(
      `${scenario.name} takes the server's ${module}, where its browser stand-in belongs`,
    );
  }
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

/* What a server or an app takes in place of the server's own modules: the browser's stand-ins. */
function runtimeBreaches(esbuild, work) {
  const direct = SCENARIOS.find((scenario) => scenario.name === "direct caller");
  return RUNTIMES.flatMap((runtime) => {
    const { result } = build(esbuild, work, direct, { ...runtime.options, splitting: false });
    const { server, browser } = sidesTaken(Object.keys(result.metafile.inputs), SERVER_ONLY);
    const missing = SERVER_ONLY.filter((module) => !server.includes(module));
    return [
      ...browser.map(
        (module) => `${runtime.name} takes the browser's ${module} in place of the server's`,
      ),
      ...missing.map((module) => `${runtime.name} does not take the server's ${module}`),
    ];
  });
}

function main() {
  const esbuild = createRequire(join(ROOT, "package.json"))("esbuild");
  const work = join(ROOT, "node_modules/.cache/courier-browser-bundles");
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  writeFileSync(join(work, "tsconfig.json"), "{}");
  const breaches = [
    ...SCENARIOS.flatMap((scenario) => breachesOf(esbuild, work, scenario)),
    ...runtimeBreaches(esbuild, work),
  ];
  rmSync(work, { recursive: true, force: true });
  const unique = [...new Set(breaches)];
  if (unique.length === 0) return;
  console.error(`\ncheck-browser-bundles: ${unique.length} breach(es)\n${unique.join("\n")}`);
  process.exit(1);
}

if (argv[1] && resolve(argv[1]) === resolve(fileURLToPath(import.meta.url))) main();
