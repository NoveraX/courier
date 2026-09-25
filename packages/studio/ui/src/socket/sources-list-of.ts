import { isPlainObject } from "./is-plain-object";

/**
 * The `sources` list of a payload Studio sent, with each entry the UI can
 * show. An entry it cannot show is left out and logged, and the rest still
 * replace the list the UI had: a config that declares one malformed import
 * must not leave every other import as it was before the save. A payload
 * that carries no list at all is logged and gives `null`, so the list the
 * UI has stays.
 *
 * @param data - The payload as Socket.IO delivered it
 * @param isItem - Whether one entry is one the UI can show
 * @param event - The event the payload came with, named in the log
 * @returns The entries the UI can show, or `null` when there is no list
 *
 * @example
 * ```ts
 * const sources = sourcesListOf(data, isSourceSummary, "registry:updated");
 * if (sources) store().setRegistrySources(sources);
 * ```
 */
export function sourcesListOf<TItem>(
  data: unknown,
  isItem: (item: unknown) => item is TItem,
  event: string,
): TItem[] | null {
  if (!isPlainObject(data) || !Array.isArray(data.sources)) {
    console.warn(`Studio sent ${event} without a list of sources; the UI keeps its list`, data);
    return null;
  }
  const shown: TItem[] = [];
  for (const entry of data.sources) {
    if (isItem(entry)) shown.push(entry);
    else console.warn(`Studio sent a ${event} entry the UI cannot show; it is left out`, entry);
  }
  return shown;
}
