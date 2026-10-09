import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/** The file a running Studio writes into its project's `.courier` folder. */
export const ADDRESS_FILE = join(".courier", "studio.json");

/**
 * The address of the Studio that runs for the project a file belongs to:
 * the nearest `.courier/studio.json` from the file's folder up to the
 * workspace folder — so each project of a monorepo finds its own Studio —
 * or `undefined` when none runs.
 *
 * @param file - The file's path
 * @param workspace - The workspace folder it is in, where the search stops
 * @returns Studio's address, or `undefined`
 * @example
 * ```ts
 * await findStudio("/work/shop/src/cart.ts", "/work"); // "http://localhost:6280"
 * ```
 */
export async function findStudio(file: string, workspace: string): Promise<string | undefined> {
  for (let dir = dirname(file); ; dir = dirname(dir)) {
    const url = await readAddress(join(dir, ADDRESS_FILE));
    if (url) return url;
    if (dir === workspace || dirname(dir) === dir || !dir.startsWith(workspace)) return undefined;
  }
}

async function readAddress(path: string): Promise<string | undefined> {
  try {
    const written: unknown = JSON.parse(await readFile(path, "utf8"));
    if (typeof written !== "object" || written === null || !("url" in written)) return undefined;
    return typeof written.url === "string" && /^https?:\/\//.test(written.url)
      ? written.url
      : undefined;
  } catch {
    /* No Studio runs for this folder, or it is writing the file this moment. */
    return undefined;
  }
}
