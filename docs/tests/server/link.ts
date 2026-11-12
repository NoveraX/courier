import { type ChildProcess, spawn } from "node:child_process"
import { createInterface, type Interface } from "node:readline"
import { fileURLToPath } from "node:url"

import { addressOf } from "./backend-process"

const DOCS = fileURLToPath(new URL("../..", import.meta.url))
const LINK_PROCESS = fileURLToPath(new URL("./link-process.ts", import.meta.url))

/**
 * The way from the site's server to its backend as it is where a system's
 * socket buffers are large: on Linux a connection takes a whole upload at
 * once, before the backend has read any of it. The link does the same on
 * every system, in a process of its own, and hands what it takes on at a
 * pace slower than the site sends — or holds it until told.
 */
export interface Link {
  /** Where the backend is reached through the link */
  readonly url: string
  /** Hand nothing more on until released. */
  hold(): Promise<void>
  /** Hand on what is held, at the link's pace, and all that comes after. */
  release(): Promise<void>
  /** End the link's process. */
  close(): void
}

/**
 * Start a link to a backend.
 *
 * @param backend - The backend's address
 * @returns The link, once it listens
 * @example
 * ```ts
 * const link = await startLink(await addressOf(startBackend()))
 * process.env.API_URL = link.url
 * ```
 */
export async function startLink(backend: string): Promise<Link> {
  const child = spawn(process.execPath, ["--import", "tsx", LINK_PROCESS, new URL(backend).port], {
    cwd: DOCS,
    stdio: ["pipe", "pipe", "inherit"],
  })
  const url = await addressOf(child)
  const lines = createInterface({ input: child.stdout as NodeJS.ReadableStream })
  return {
    url,
    hold: () => told(child, lines, "hold"),
    release: () => told(child, lines, "release"),
    close: () => {
      child.kill()
    },
  }
}

/* Tell the link a word, and wait for it to say the word back. */
function told(child: ChildProcess, lines: Interface, word: string): Promise<void> {
  return new Promise((resolve, reject) => {
    function said(line: string): void {
      if (line !== word) return
      settle()
      resolve()
    }
    function exited(): void {
      settle()
      reject(new Error(`The link ended before it was told to ${word}`))
    }
    function settle(): void {
      lines.off("line", said)
      child.off("exit", exited)
    }
    lines.on("line", said)
    child.once("exit", exited)
    child.stdin?.write(`${word}\n`)
  })
}
