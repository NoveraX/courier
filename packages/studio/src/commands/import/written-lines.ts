import { resolveImportLayout } from "../../apis/layout";
import type { WriteBody, WriteResult } from "../../server/write-types";
import { counted, KEPT } from "./plan-lines";

const KEPT_WORDS: ReadonlyMap<string, string> = new Map(Object.entries(KEPT));

function wroteLine(written: number, kept: number, dir: string): string {
  if (written > 0) return `Wrote ${counted(written, "file", "files")} in ${dir}.`;
  return kept > 0
    ? `Wrote no file in ${dir}.`
    : `Every file in ${dir} already holds what the specification gives it.`;
}

function keptLine({ path, reason }: WriteResult["kept"][number]): string {
  if (reason === "unconfirmed")
    return `Kept ${path} as it is; allow the change with --confirm ${path}`;
  return `Kept ${path} as it is: ${KEPT_WORDS.get(reason) ?? reason}`;
}

/**
 * What writing the import did, in lines: the files written, those removed
 * and where their copies are, each file kept as it is and why — with how to
 * allow a change you did not allow — files left behind where the import was
 * before, and folders that could not be removed.
 *
 * @param result - What the write did
 * @param dir - The import's folder
 * @returns The lines
 * @example
 * ```ts
 * writtenLines(result, "src/api/pet-store"); // ["Wrote 8 files in src/api/pet-store."]
 * ```
 */
export function writtenLines(result: WriteResult, dir: string): string[] {
  const { written, removed, kept, backupDir, leftBehind, pruneFailures } = result;
  const copies = backupDir === undefined ? "" : `; their copies are in ${backupDir}`;
  return [
    wroteLine(written.length, kept.length, dir),
    ...(removed.length > 0
      ? [`Removed ${counted(removed.length, "file", "files")}${copies}.`]
      : []),
    ...kept.map(keptLine),
    ...leftBehind.map((path) => `Left ${path} where the import was before.`),
    ...pruneFailures.map(
      ({ path, code }) => `Could not remove the emptied folder ${path} (${code}).`,
    ),
  ];
}

/**
 * How code calls the API the import declares: the direct caller its
 * `index.ts` exports, for server code, and the proxy caller its `proxy.ts`
 * exports, for the browser — those the import generates.
 *
 * @param body - The import
 * @returns A line for each caller generated
 * @example
 * ```ts
 * usageLines(body); // ['Call it: import { petStoreApi } from "./src/api/pet-store"']
 * ```
 */
export function usageLines(body: WriteBody): string[] {
  const { dir, sourceBinding } = resolveImportLayout(body.options, body.sourceName);
  const client = body.options.generateClient ?? "direct";
  return [
    ...(client === "direct" || client === "both"
      ? [`Call it: import { ${sourceBinding}Api } from "./${dir}"`]
      : []),
    ...(client === "proxy" || client === "both"
      ? [`From the browser: import { ${sourceBinding}ProxyApi } from "./${dir}/proxy"`]
      : []),
  ];
}
