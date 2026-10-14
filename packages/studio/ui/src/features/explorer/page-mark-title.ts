import type { PageMark } from "@/features/apis/types";

/**
 * What an endpoint's page mark says in a sentence — whether a page may call
 * it through the proxy, and the mark that decided — for the tag on its row,
 * the hint on its definition and the Playground's warning.
 *
 * @param mark - Whether a page may call the endpoint, and why
 * @returns The sentence
 * @example
 * ```ts
 * pageMarkTitle({ exposed: true, reason: "expose: true on orders" });
 * // "A page may call it through the proxy — expose: true on orders"
 * ```
 */
export function pageMarkTitle(mark: PageMark): string {
  return mark.exposed
    ? `A page may call it through the proxy — ${mark.reason}`
    : `Kept to the server: the proxy refuses a page's call to it — ${mark.reason}`;
}
