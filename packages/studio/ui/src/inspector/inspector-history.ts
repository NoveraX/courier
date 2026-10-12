/** Where a history entry sits: its place in the history, and its page. */
export interface HistorySpot {
  index: number;
  path: string;
}

/**
 * Whether closing the inspector should go back a step rather than add one.
 * On a phone the inspector is a page of its own, and the entry its opening
 * added over a page is left the way a page is: going back. Back afterwards
 * then leaves that page, instead of opening the request again. An
 * inspector opened from a link — no entry of its own — or showing after
 * the reader moved elsewhere closes in place.
 *
 * @param opened - The entry the inspector's opening added, if it added one
 * @param here - The entry shown
 * @param phone - Whether the inspector is a page of its own
 * @returns Whether to go back
 * @example
 * ```ts
 * closesByGoingBack({ index: 4, path: "/timeline" }, { index: 4, path: "/timeline" }, true); // true
 * closesByGoingBack(undefined, { index: 0, path: "/timeline" }, true); // false
 * ```
 */
export function closesByGoingBack(
  opened: HistorySpot | undefined,
  here: HistorySpot,
  phone: boolean,
): boolean {
  return phone && opened !== undefined && opened.index === here.index && opened.path === here.path;
}
