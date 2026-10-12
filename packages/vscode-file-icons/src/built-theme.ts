import { readFile } from "node:fs/promises";

/**
 * Whether an icon theme's built theme file names Courier's icons. Every
 * profile shares that file — it sits in the theme's own folder — and the
 * theme builds it from the settings of whichever profile changed them
 * last, without looking again when another profile starts: it may show
 * another profile's choice.
 *
 * @param file - The theme file
 * @param mark - What names Courier's icons in it
 * @returns Whether it names them; `undefined` when it cannot be read
 * @example
 * ```ts
 * if ((await builtWithCourier(manifest, ICONS_HOME)) === false) await rebuild();
 * ```
 */
export async function builtWithCourier(file: string, mark: string): Promise<boolean | undefined> {
  const text = await readFile(file, "utf8").catch(() => undefined);
  return text === undefined ? undefined : text.includes(mark);
}
