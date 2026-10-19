import { asNode, fieldOf, listAt, nodeAt, type SpecNode, textAt } from "./spec-node";

/** A folder being walked: the items it lists, how far the walk is, and what it collected. */
interface Folder<TCollected> {
  readonly items: readonly unknown[];
  readonly name: string | null;
  next: number;
  readonly collected: TCollected[];
}

/**
 * Walk a Postman collection's folders without recursion, however deep they
 * nest: each request in the order the collection lists it, and each folder
 * once all of its items are walked, the folders inside it before it. A
 * folder with no name of its own is named as the one around it; the
 * collection itself is `null`.
 *
 * @param items - The collection's items
 * @param collect - What a request is collected as in its folder, or `undefined` for nothing
 * @param leave - Called with a folder and what it collected, once its items are walked
 * @example
 * ```ts
 * walkPostmanFolders(listAt(collection, "item"), (_, request) => request, (folder, requests) => {
 *   console.log(folder, requests.length);
 * });
 * ```
 */
export function walkPostmanFolders<TCollected>(
  items: readonly unknown[],
  collect: (item: SpecNode, request: SpecNode, folder: string | null) => TCollected | undefined,
  leave: (folder: string | null, collected: TCollected[]) => void,
): void {
  const folders: Array<Folder<TCollected>> = [{ items, name: null, next: 0, collected: [] }];
  for (let folder = folders.at(-1); folder !== undefined; folder = folders.at(-1)) {
    if (folder.next >= folder.items.length) {
      folders.pop();
      leave(folder.name, folder.collected);
      continue;
    }
    const item = asNode(folder.items[folder.next]);
    folder.next += 1;
    if (fieldOf(item, "item")) {
      const name = textAt(item, "name") ?? folder.name ?? "";
      folders.push({ items: listAt(item, "item"), name, next: 0, collected: [] });
      continue;
    }
    const request = nodeAt(item, "request");
    const collected = request ? collect(item, request, folder.name) : undefined;
    if (collected !== undefined) folder.collected.push(collected);
  }
}
