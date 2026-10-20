import fs from "node:fs"
import path from "node:path"

import { sourceMetadata } from "./source-metadata"

const LEGAL_DIR = path.join(process.cwd(), "src/content/legal")

/** The legal pages, by the name of their source under `src/content/legal`. */
export type LegalPage = "privacy" | "consent"

/**
 * When a legal page's text last changed, `YYYY-MM-DD`, as its source's
 * metadata says — read from the source, where no MDX compiler is at hand,
 * for the sitemap and the page's head alike.
 *
 * @param page - The page
 * @returns The date, or `undefined` when the source says none
 * @example
 * ```ts
 * legalUpdated("privacy") // "2026-10-21"
 * ```
 */
export function legalUpdated(page: LegalPage): string | undefined {
  const file = path.join(LEGAL_DIR, `${page}.mdx`)
  return fs.existsSync(file) ? sourceMetadata(fs.readFileSync(file, "utf8")).updated : undefined
}
