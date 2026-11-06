/**
 * The sections of the docs that moved to another page, by the page they
 * left and the anchor they had there: each with its new address. A link
 * someone keeps to the old anchor reaches the page the section left, which
 * sends the reader on — a fragment never reaches the server, so no
 * redirect of the site's can. The section's old place keeps a sentence
 * that links to the new one, for a reader the page cannot send on.
 */
export const MOVED_ANCHORS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  "/docs/advanced/realtime": {
    "connection-options": "/docs/advanced/realtime-connections#connection-options",
    "staying-connected": "/docs/advanced/realtime-connections#staying-connected",
    "who-a-connection-is": "/docs/advanced/realtime-connections#who-a-connection-is",
  },
}

/**
 * The anchors of a docs page whose sections moved, with where each went.
 *
 * @param path - The page's address: `/docs/studio/overview`
 * @returns Its moved anchors, or nothing for a page none left
 * @example
 * ```ts
 * movedAnchorsOf("/docs/quick-start") // undefined
 * ```
 */
export function movedAnchorsOf(path: string): Readonly<Record<string, string>> | undefined {
  return MOVED_ANCHORS[path]
}
