#!/usr/bin/env node
/// <reference types="node" />
/**
 * Typecheck the declarations the packages actually publish.
 *
 * Every other gate reads `src`: `tsc --noEmit` resolves sibling packages
 * through path mappings into their sources, and the tests exercise the
 * compiled JavaScript. Nothing looks at the `.d.ts` files in `lib`, which are
 * the only thing a consumer ever sees — so a declaration build could emit a
 * broken or missing type for a published entry point and every gate would
 * still be green.
 *
 * This writes a file importing every subpath the `exports` maps promise, by
 * package name, and typechecks it. Resolution goes through each manifest's
 * `exports` exactly as a consumer's would.
 *
 * It runs twice, because the two resolvers disagree about real things: a
 * `bundler` consumer and a `node16` consumer follow different rules for
 * conditions and for subpaths into dependencies, so a declaration can resolve
 * under one and silently widen to `any` under the other.
 *
 * Requires a build first. Exits 1 with tsc's output when anything fails.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const PACKAGES = join(ROOT, "packages");

/** Every public entry point, as the specifier a consumer would import. */
function collectEntries() {
  const specifiers = [];

  for (const dir of readdirSync(PACKAGES)) {
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(join(PACKAGES, dir, "package.json"), "utf8"));
    } catch {
      continue;
    }
    if (!manifest.name || manifest.private) continue;

    for (const [subpath, target] of Object.entries(manifest.exports ?? {})) {
      if (typeof target !== "object" || target === null || !("types" in target)) continue;
      specifiers.push(subpath === "." ? manifest.name : `${manifest.name}/${subpath.slice(2)}`);
    }
  }

  return specifiers.sort();
}

const entries = collectEntries();
if (entries.length === 0) {
  console.error("check-exports: no published entry points found — is packages/ present?");
  process.exit(1);
}

/* Inside the workspace, so bare specifiers resolve through the root
   node_modules exactly as they would for an installed consumer. */
const probeDir = join(ROOT, "node_modules", ".cache", "courier-check-exports");
mkdirSync(probeDir, { recursive: true });
const probeSource = entries
  .map((spec, i) => `import type * as m${i} from "${spec}";\nexport type T${i} = keyof typeof m${i};`)
  .join("\n");

/** How a consumer resolves us. Both are real; neither subsumes the other. */
const RESOLUTIONS = [
  { name: "bundler", module: "esnext", moduleResolution: "bundler", ext: "ts" },
  { name: "node16", module: "node16", moduleResolution: "node16", ext: "mts" },
];

let failed = false;

for (const resolution of RESOLUTIONS) {
  const probe = join(probeDir, `probe.${resolution.ext}`);
  writeFileSync(probe, probeSource);

  try {
    execFileSync(
      "npx",
      [
        "tsc",
        "--noEmit",
        "--strict",
        "--skipLibCheck",
        "--module",
        resolution.module,
        "--moduleResolution",
        resolution.moduleResolution,
        "--target",
        "esnext",
        "--types",
        "node",
        "--ignoreConfig",
        probe,
      ],
      { cwd: ROOT, stdio: "pipe", encoding: "utf8" },
    );
    console.log(`check-exports: ${entries.length} entry points typecheck under ${resolution.name}`);
  } catch (error) {
    failed = true;
    console.error(`\ncheck-exports: entry points fail to resolve under ${resolution.name}\n`);
    console.error(error.stdout || error.message);
  }
}

rmSync(probeDir, { recursive: true, force: true });

if (failed) process.exit(1);

