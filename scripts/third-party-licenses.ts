/// <reference types="node" />
/**
 * A Vite plugin that writes `THIRD-PARTY-LICENSES.txt` beside a bundle: the
 * name, version, licence and licence text of every package from
 * `node_modules` the bundle carries code or files of. Minified bundles drop
 * the notices MIT, ISC, Apache and the SIL Open Font License require in
 * every copy; this file keeps them with the copy that ships.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, sep } from "node:path";
import type { Plugin } from "vite";

/** A package the bundle carries, and the licence it ships under. */
export interface BundledPackage {
  name: string;
  version: string;
  license: string;
  /** The package's licence file, or a note that it ships none. */
  text: string;
}

const NODE_MODULES = `${sep}node_modules${sep}`;
const LICENSE_FILE = /^(licen[cs]e|copying)(\.(md|txt))?$/i;
const RULE = "─".repeat(72);

/**
 * The directory of the package a module belongs to, when it comes from
 * `node_modules`: `/app/node_modules/@scope/pkg` for
 * `/app/node_modules/@scope/pkg/dist/index.js`. Virtual-module prefixes and
 * query strings are ignored; the last `node_modules` in the path wins, so a
 * nested dependency is its own package.
 *
 * @param id - A module id as the bundler reports it
 * @returns The package directory, or `null` for a module of the project itself
 * @example
 * ```ts
 * packageRootOf("/app/node_modules/react/index.js"); // "/app/node_modules/react"
 * ```
 */
export function packageRootOf(id: string): string | null {
  const path = id.replace(/^\0/, "").split("?")[0] ?? "";
  const at = path.lastIndexOf(NODE_MODULES);
  if (at === -1) return null;
  const rest = path.slice(at + NODE_MODULES.length).split(sep);
  const parts = rest[0]?.startsWith("@") ? rest.slice(0, 2) : rest.slice(0, 1);
  if (parts.length === 0 || parts.some((part) => part === "")) return null;
  return join(path.slice(0, at + NODE_MODULES.length), ...parts);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function licenseText(root: string): string {
  const file = readdirSync(root).find((name) => LICENSE_FILE.test(name));
  return file === undefined
    ? "(The package ships no licence file.)"
    : readFileSync(join(root, file), "utf8").trim();
}

/**
 * Read what a package directory says of itself and of its licence.
 *
 * @param root - The package's directory
 * @returns The package, or `null` when the directory has no `package.json`
 * @example
 * ```ts
 * readBundledPackage("/app/node_modules/react"); // { name: "react", license: "MIT", … }
 * ```
 */
export function readBundledPackage(root: string): BundledPackage | null {
  const manifestPath = join(root, "package.json");
  if (!existsSync(manifestPath)) return null;
  const manifest: unknown = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (!isRecord(manifest)) return null;
  const field = (key: string): string => {
    const value = manifest[key];
    return typeof value === "string" ? value : "";
  };
  if (field("name") === "") return null;
  return {
    name: field("name"),
    version: field("version"),
    license: field("license") || "UNKNOWN",
    text: licenseText(root),
  };
}

/**
 * The notices file for a set of packages, one section each, by name.
 *
 * @param product - What the bundle is, for the file's first line
 * @param packages - The packages it carries
 * @returns The file's text
 * @example
 * ```ts
 * formatNotices("Courier Studio's interface", [react]);
 * ```
 */
export function formatNotices(product: string, packages: readonly BundledPackage[]): string {
  const sorted = [...packages].sort((a, b) => a.name.localeCompare(b.name));
  const sections = sorted.map(
    (pkg) => `${RULE}\n${pkg.name} ${pkg.version} — ${pkg.license}\n${RULE}\n\n${pkg.text}\n`,
  );
  return `${product} carries the following packages, under the licences below.\n\n${sections.join("\n")}`;
}

/**
 * The plugin: collects the packages of every module in the output chunks —
 * styles included, so a font's licence travels with its files — and emits
 * the notices as `THIRD-PARTY-LICENSES.txt`.
 *
 * @param product - What the bundle is, for the file's first line
 * @returns The Vite plugin
 * @example
 * ```ts
 * export default defineConfig({ plugins: [thirdPartyLicenses("Courier Studio's interface")] });
 * ```
 */
export function thirdPartyLicenses(product: string): Plugin {
  return {
    name: "courier:third-party-licenses",
    apply: "build",
    generateBundle(_options, bundle) {
      const roots = new Set<string>();
      for (const output of Object.values(bundle)) {
        if (output.type !== "chunk") continue;
        for (const id of output.moduleIds) {
          const root = packageRootOf(id);
          if (root !== null) roots.add(root);
        }
      }
      const packages = new Map<string, BundledPackage>();
      for (const root of roots) {
        const pkg = readBundledPackage(root);
        if (pkg !== null) packages.set(`${pkg.name}@${pkg.version}`, pkg);
      }
      this.emitFile({
        type: "asset",
        fileName: "THIRD-PARTY-LICENSES.txt",
        source: formatNotices(product, [...packages.values()]),
      });
    },
  };
}
