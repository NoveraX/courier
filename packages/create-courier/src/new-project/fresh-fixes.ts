import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { appendItem } from "../edit/insert";
import { propertyLiteral } from "../edit/literal";
import { nextCode, scanSource } from "../edit/source-scan";
import type { FrameworkId } from "../frameworks";
import type { PackageManagerName } from "../project/package-manager";

const LOCKFILES: Readonly<Record<PackageManagerName, readonly string[]>> = {
  npm: ["package-lock.json"],
  pnpm: ["pnpm-lock.yaml"],
  yarn: ["yarn.lock"],
  bun: ["bun.lock", "bun.lockb"],
};

/* Lockfiles a template brings for another package manager than the project's, which would tell tools to install with it. */
function removeForeignLockfiles(root: string, manager: PackageManagerName): string[] {
  const foreign = Object.entries(LOCKFILES)
    .filter(([name]) => name !== manager)
    .flatMap(([, files]) => files)
    .filter((file) => existsSync(join(root, file)));
  for (const file of foreign) rmSync(join(root, file));
  return foreign;
}

/* fastify-cli's TypeScript template names outDir without rootDir, which TypeScript 6 refuses to build (TS5011). */
function fastifyRootDir(root: string): boolean {
  const path = join(root, "tsconfig.json");
  const text = existsSync(path) ? readFileSync(path, "utf8") : undefined;
  const scan = text === undefined ? undefined : scanSource(text);
  const open = scan === undefined ? -1 : nextCode(scan, 0);
  const close = scan?.closer.get(open);
  if (scan === undefined || close === undefined) return false;
  const options = propertyLiteral(scan, { open, close }, "compilerOptions");
  if (options === null || options === undefined) return false;
  if (propertyLiteral(scan, options, "rootDir") !== null) return false;
  writeFileSync(path, appendItem(scan, options, '"rootDir": "src"'));
  return true;
}

/**
 * Put right what a framework's own template gets wrong for the project it
 * makes, before Courier is set up in it: a lockfile for another package
 * manager than the person's, and fastify-cli's tsconfig, whose build
 * TypeScript 6 refuses without a `rootDir`.
 *
 * @param root - The new project's folder
 * @param framework - Its framework
 * @param manager - The package manager it installs with
 * @returns What was put right, a sentence each
 * @example
 * ```ts
 * fixFreshProject("/work/app", "solid-start", "npm"); // ["Removed pnpm-lock.yaml, which the template brought for pnpm"]
 * ```
 */
export function fixFreshProject(
  root: string,
  framework: FrameworkId,
  manager: PackageManagerName,
): string[] {
  const fixed = removeForeignLockfiles(root, manager).map(
    (file) => `Removed ${file}, which the template brought for another package manager`,
  );
  if (framework === "fastify" && fastifyRootDir(root)) {
    fixed.push('Set "rootDir": "src" in tsconfig.json, which TypeScript 6 asks for to build');
  }
  return fixed;
}
