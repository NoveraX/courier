import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { bundleDocs } from "../../scripts/bundle-docs";

/** The site's MDX pages, which the docs folder is written from. */
export const CONTENT = join(import.meta.dirname, "../../../../docs/src/content/docs");

/** A docs folder written from the site's pages for a test, and how to remove it. */
export interface Bundled {
  readonly dir: string;
  remove(): void;
}

/**
 * Write the docs folder as the package's build does, into a folder of the
 * test's own.
 *
 * @returns Where it is, and how to remove it
 * @example
 * ```ts
 * const bundled = bundled(); afterAll(bundled.remove);
 * ```
 */
export function bundled(): Bundled {
  const work = mkdtempSync(join(tmpdir(), "courier-docs-"));
  const dir = join(work, "docs");
  bundleDocs({ contentDir: CONTENT, outDir: dir, version: "0.0.0-test" });
  return { dir, remove: () => rmSync(work, { recursive: true, force: true }) };
}
