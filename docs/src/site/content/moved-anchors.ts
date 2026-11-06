/**
 * The sections of the docs that moved to another page, by the page they
 * left and the anchor they had there: each with its new address. A link
 * someone keeps to the old anchor reaches the page the section left, which
 * sends the reader on — a fragment never reaches the server, so no
 * redirect of the site's can. The section's old place keeps a sentence
 * that links to the new one, for a reader the page cannot send on.
 */
export const MOVED_ANCHORS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  "/docs/studio/import-api": {
    "which-files-studio-changes": "/docs/studio/import-files#which-files-studio-changes",
    "how-studio-formats-the-files": "/docs/studio/import-files#how-studio-formats-the-files",
    "specifications-on-a-private-network":
      "/docs/studio/import-access#specifications-on-a-private-network",
    "specifications-behind-auth": "/docs/studio/import-access#specifications-behind-auth",
  },
  "/docs/studio/editor": {
    snippets: "/docs/studio/editor-reference#snippets",
    "commands-and-settings": "/docs/studio/editor-reference#commands-and-settings",
    "how-a-call-is-found": "/docs/studio/editor-reference#how-a-call-is-found",
    "from-studio-to-the-code": "/docs/studio/editor-reference#from-studio-to-the-code",
    "what-stays-on-your-machine": "/docs/studio/editor-reference#what-stays-on-your-machine",
  },
  "/docs/studio/network-conditions": {
    "change-them-while-the-server-runs":
      "/docs/studio/network-conditions-in-code#change-them-while-the-server-runs",
  },
  "/docs/advanced/upload": {
    "where-the-proxy-keeps-an-upload": "/docs/proxy-mode/uploads#where-the-proxy-keeps-an-upload",
    "sending-an-upload-on-as-it-arrives":
      "/docs/proxy-mode/uploads#sending-an-upload-on-as-it-arrives",
    "what-the-proxy-takes": "/docs/proxy-mode/uploads#what-the-proxy-takes",
  },
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
