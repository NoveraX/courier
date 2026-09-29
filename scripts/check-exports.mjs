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
 * It runs under both resolvers, because they disagree about real things: a
 * `bundler` consumer and a `node16` consumer follow different rules for
 * conditions and for subpaths into dependencies, so a declaration can resolve
 * under one and silently widen to `any` under the other. It runs once more
 * without the DOM library, as a project typed for Node alone loads none: a
 * declaration naming `BodyInit` compiled here and failed there.
 *
 * The declarations are checked, not skipped: skipped, a name they could not
 * resolve became `any` without a word. Errors in other packages'
 * declarations are theirs and left out; one in ours, or in the probe, fails.
 *
 * Requires a build first. Exits 1 with tsc's output when anything fails.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { argv } from "node:process";

const ROOT = resolve(import.meta.dirname, "..");
const PACKAGES = join(ROOT, "packages");

/**
 * The errors in tsc's output that are ours: in a package's published
 * declarations, or in the probe that imports them.
 *
 * @param {string} output - What tsc printed
 * @returns {string[]} The lines reporting such an error
 * @example
 * ourErrors("packages/core/lib/index.d.ts(3,1): error TS2304: …\nnode_modules/x/index.d.ts(1,1): error TS2304: …");
 * // → ["packages/core/lib/index.d.ts(3,1): error TS2304: …"]
 */
export function ourErrors(output) {
  return output
    .split("\n")
    .filter((line) => /error TS\d+/.test(line))
    .filter((line) => /(?:^|\/)packages\/[^/]+\/lib\/|courier-check-exports\/probe\./.test(line));
}

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

function main() {
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
    .map(
      (spec, i) =>
        `import type * as m${i} from "${spec}";\nexport type T${i} = keyof typeof m${i};`,
    )
    .join("\n");

  /** How a consumer resolves and types us. Each is real; none subsumes another. */
  const RESOLUTIONS = [
    { name: "bundler", module: "esnext", moduleResolution: "bundler", ext: "ts", lib: [] },
    { name: "node16", module: "node16", moduleResolution: "node16", ext: "mts", lib: [] },
    {
      name: "node16 without the DOM library",
      module: "node16",
      moduleResolution: "node16",
      ext: "mts",
      lib: ["--lib", "esnext"],
    },
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
          "--module",
          resolution.module,
          "--moduleResolution",
          resolution.moduleResolution,
          "--target",
          "esnext",
          "--types",
          "node",
          ...resolution.lib,
          "--ignoreConfig",
          probe,
        ],
        { cwd: ROOT, stdio: "pipe", encoding: "utf8" },
      );
      console.log(
        `check-exports: ${entries.length} entry points typecheck under ${resolution.name}`,
      );
    } catch (error) {
      const ours = ourErrors(String(error.stdout ?? ""));
      if (ours.length === 0 && error.stdout) {
        console.log(
          `check-exports: ${entries.length} entry points typecheck under ${resolution.name}`,
        );
        continue;
      }
      failed = true;
      console.error(`\ncheck-exports: entry points fail to typecheck under ${resolution.name}\n`);
      console.error(ours.length > 0 ? ours.join("\n") : error.message);
    }
  }

  rmSync(probeDir, { recursive: true, force: true });

  if (failed) process.exit(1);
}

// Only run as CLI when invoked directly (not when imported by the self-test).
if (argv[1]?.endsWith("check-exports.mjs")) main();
