/**
 * The one command that sets Courier up in a project, or in a new one. A
 * module of its own, outside every client component's, so a server
 * component reads the text itself: imported from a `"use client"` module,
 * it would be a reference to the client's copy.
 *
 * @example
 * ```ts
 * `${START_COMMAND} --mcp` // "npx @noverax/create-courier --mcp"
 * ```
 */
export const START_COMMAND = "npx @noverax/create-courier"
