/// <reference types="node" />
/**
 * Check what a page takes from Courier, built as an app's bundler builds it
 * for production — esbuild, webpack and Vite — from the packages as they
 * are published. Turbopack, which only Next.js runs, is measured by the
 * framework matrix's Next.js applications, against the budgets here.
 *
 * Each scenario is one the documentation shows for a page
 * (`browser-bundles/scenarios.mjs`). For each:
 *
 *  - no built-in module of Node is reached, at start or later;
 *  - no module only a server runs is taken, in any chunk, a dynamic
 *    import's too: neither one of the areas `module-sides.json` names, nor
 *    one taken as it is where its browser stand-in belongs;
 *  - what loads at start stays within its budget for each bundler,
 *    minified and gzipped;
 *  - no browser API newer than the browsers the requirements name —
 *    Safari 15.4, Chrome 97, Firefox 104 — nor one a page served over plain
 *    HTTP lacks, is called where its module does not check for it first.
 *
 * And the core, built for Node, an edge runtime and React Native, takes
 * those modules as they are, never the browser's stand-ins; what
 * Next.js's edge runtime may take of the core — each entry but Node's own —
 * reads no Node API off the global `process` but `process.env`: Next.js's
 * build of a middleware refuses one, or warns of it.
 *
 * Requires a build first. Exits 1 with each breach.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { builtinModules, createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { argv } from "node:process";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { viteStart } from "./browser-bundles/build-vite.mjs";
import { webpackStart } from "./browser-bundles/build-webpack.mjs";
import { breachesOrFailure, builtOrFailed } from "./browser-bundles/built-or-failed.mjs";
import { newerApiCalls } from "./browser-bundles/newer-api-calls.mjs";
import { GLOBAL_PROCESS, processReads } from "./browser-bundles/process-reads.mjs";
import { PROVIDED, SCENARIOS } from "./browser-bundles/scenarios.mjs";
import { serverOnlyModules } from "./browser-bundles/server-only-modules.mjs";
import { publishedModules, sidesTaken } from "./browser-bundles/sides-taken.mjs";
import { startClosure } from "./browser-bundles/start-closure.mjs";
import { serverAreaOf } from "./module-graph/server-area.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const KIB = 1024;
const SERVER_ONLY = serverOnlyModules(join(ROOT, "packages/core/lib"));
/* The areas of the core's build only a server runs, as the module graph's check reads them. */
const SERVER_AREAS = Object.keys(
  JSON.parse(readFileSync(join(ROOT, "packages/core/module-sides.json"), "utf8")).serverAreas,
);

/* Next.js's edge runtime, as it resolves a package: a middleware's, and an edge route's. */
const NEXT_EDGE = { platform: "neutral", conditions: ["edge-light", "worker", "browser"] };

/* Where code runs on a server or in an app, as their bundlers resolve a package: none of them a page. */
const RUNTIMES = [
  { name: "Node", options: { platform: "node" } },
  { name: "Next.js's edge runtime", options: NEXT_EDGE },
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

/* What a bundler's build of a scenario breaches in any chunk, a dynamic import's too: a module
   only a server runs, taken where its browser stand-in belongs or lying in a server's area. */
function sideBreaches(scenario, bundler, everyModule) {
  const breaches = sidesTaken(everyModule, SERVER_ONLY).server.map(
    (module) =>
      `${scenario.name} takes the server's ${module} under ${bundler}, where its browser stand-in belongs`,
  );
  for (const module of publishedModules(everyModule)) {
    const area = serverAreaOf(module, SERVER_AREAS);
    if (area !== undefined)
      breaches.push(
        `${scenario.name} takes ${module} under ${bundler}, of ${area}, which only a server runs`,
      );
  }
  return breaches;
}

/* What a bundler's start of a scenario breaches: its budget. */
function startBreaches(scenario, bundler, { bytes, gzipped }) {
  const [budget, budgetGzipped] = scenario.budget[bundler];
  const size = `${(bytes / KIB).toFixed(1)} KiB, ${(gzipped / KIB).toFixed(1)} KiB gzipped`;
  console.log(
    `check-browser-bundles: ${scenario.name}, ${bundler} — ${size} at start (budget ${budget}, ${budgetGzipped})`,
  );
  const breaches = [];
  if (bytes > budget * KIB || gzipped > budgetGzipped * KIB) {
    breaches.push(
      `${scenario.name} loads ${size} at start under ${bundler}, over its budget of ${budget} KiB, ${budgetGzipped} KiB gzipped`,
    );
  }
  return breaches;
}

/* The scenario built by webpack and by Vite, as an application built with either takes it. */
async function otherBundlersBreaches(bundlers, work, scenario) {
  const dir = join(work, scenario.name.replace(/\W+/g, "-"));
  mkdirSync(dir, { recursive: true });
  const entry = join(dir, "page.js");
  writeFileSync(entry, scenario.code);
  const builds = {
    webpack: () => webpackStart(bundlers.webpack, entry, join(dir, "webpack"), PROVIDED),
    vite: () => viteStart(bundlers.vite, entry, dir, PROVIDED),
  };
  const breaches = [];
  for (const [bundler, build] of Object.entries(builds)) {
    const built = await builtOrFailed(scenario.name, bundler, build);
    if ("breach" in built) {
      breaches.push(built.breach);
      continue;
    }
    const { code, everyModule } = built.start;
    breaches.push(...sideBreaches(scenario, bundler, everyModule));
    breaches.push(
      ...startBreaches(scenario, bundler, { bytes: code.length, gzipped: gzipSync(code).length }),
    );
  }
  return breaches;
}

function breachesOf(esbuild, work, scenario) {
  const { bytes, gzipped, builtins, inputs } = measure(esbuild, work, scenario);
  const breaches = builtins.map(
    (builtin) => `${scenario.name} reaches ${builtin}, which no browser has`,
  );
  breaches.push(...sideBreaches(scenario, "esbuild", inputs));
  breaches.push(...startBreaches(scenario, "esbuild", { bytes, gzipped }));
  const whole = build(esbuild, work, scenario, { minify: false, splitting: false }).result;
  for (const call of newerApiCalls(whole.outputFiles[0]?.text ?? "")) {
    breaches.push(
      `${call.module} calls ${call.api}, which ${call.lacking} lack, without checking for it first`,
    );
  }
  return breaches;
}

/* What a server or an app takes in place of the server's own modules: the browser's stand-ins.
   The root offers both sides, so it reaches every one of those modules. */
const UNIVERSAL = { name: "the core's root", code: 'export * from "@noverax/courier";' };

function runtimeBreaches(esbuild, work, runtime) {
  const { result } = build(esbuild, work, UNIVERSAL, { ...runtime.options, splitting: false });
  const { server, browser } = sidesTaken(Object.keys(result.metafile.inputs), SERVER_ONLY);
  const missing = SERVER_ONLY.filter((module) => !server.includes(module));
  return [
    ...browser.map(
      (module) => `${runtime.name} takes the browser's ${module} in place of the server's`,
    ),
    ...missing.map((module) => `${runtime.name} does not take the server's ${module}`),
  ];
}

/* The Node APIs read off the global `process` by what Next.js's edge runtime may take of the
   core: each entry but Node's own, whole. */
function edgeBreaches(esbuild, work) {
  const { exports } = JSON.parse(readFileSync(join(ROOT, "packages/core/package.json"), "utf8"));
  const code = Object.keys(exports)
    .filter((path) => path !== "./package.json" && path !== "./node")
    .map((path, at) => `export * as entry${at} from "@noverax/courier${path.slice(1)}";`)
    .join("\n");
  const { result } = build(
    esbuild,
    work,
    { name: "the core on the edge", code },
    {
      ...NEXT_EDGE,
      splitting: false,
      define: { "process.env.NODE_ENV": '"production"', process: GLOBAL_PROCESS },
    },
  );
  return processReads(result.outputFiles[0]?.text ?? "").map(
    (read) =>
      `${read.module} reads ${read.api}, which Next.js's build of a middleware refuses or warns of: read it off globalThis.process`,
  );
}

async function main() {
  const require = createRequire(join(ROOT, "package.json"));
  const esbuild = require("esbuild");
  const bundlers = { webpack: require("webpack"), vite: await import(require.resolve("vite")) };
  const work = join(ROOT, "node_modules/.cache/courier-browser-bundles");
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  writeFileSync(join(work, "tsconfig.json"), "{}");
  const breaches = [
    ...SCENARIOS.flatMap((scenario) =>
      breachesOrFailure(scenario.name, "esbuild", () => breachesOf(esbuild, work, scenario)),
    ),
    ...RUNTIMES.flatMap((runtime) =>
      breachesOrFailure(UNIVERSAL.name, runtime.name, () =>
        runtimeBreaches(esbuild, work, runtime),
      ),
    ),
    ...breachesOrFailure("the core on the edge", "esbuild", () => edgeBreaches(esbuild, work)),
  ];
  for (const scenario of SCENARIOS) {
    breaches.push(...(await otherBundlersBreaches(bundlers, work, scenario)));
  }
  rmSync(work, { recursive: true, force: true });
  const unique = [...new Set(breaches)];
  if (unique.length === 0) return;
  console.error(`\ncheck-browser-bundles: ${unique.length} breach(es)\n${unique.join("\n")}`);
  process.exit(1);
}

if (argv[1] && resolve(argv[1]) === resolve(fileURLToPath(import.meta.url))) await main();
