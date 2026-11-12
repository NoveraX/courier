import { type ChildProcess, spawn } from "node:child_process"
import { fileURLToPath } from "node:url"

const DOCS = fileURLToPath(new URL("../..", import.meta.url))
const LISTENING = /listens on (http:\/\/127\.0\.0\.1:\d+)/

/**
 * The examples' backend as the site's container runs it: `server/index.ts`
 * in a process of its own, on a port the system picks.
 *
 * @returns The process, its output piped
 * @example
 * ```ts
 * const backend = startBackend()
 * const url = await addressOf(backend)
 * ```
 */
export function startBackend(): ChildProcess {
  return spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
    cwd: DOCS,
    env: { ...process.env, EXPRESS_HOST: "127.0.0.1", EXPRESS_PORT: "0" },
  })
}

/**
 * Where a server started in a process of its own listens, from the line it
 * writes once it does. What it writes after is drained unread, so that a
 * full pipe never holds it up.
 *
 * @param child - The process, its output piped
 * @returns Its address
 * @throws Error with what it wrote, should it exit before it listens
 * @example
 * ```ts
 * const url = await addressOf(startBackend())
 * ```
 */
export function addressOf(child: ChildProcess): Promise<string> {
  let output = ""
  return new Promise((resolve, reject) => {
    function take(chunk: Buffer): void {
      output += chunk.toString()
      const found = LISTENING.exec(output)?.[1]
      if (found === undefined) return
      settle()
      resolve(found)
    }
    function exited(): void {
      settle()
      reject(new Error(`The process exited before it listened:\n${output}`))
    }
    function settle(): void {
      child.stdout?.off("data", take)
      child.stderr?.off("data", take)
      child.off("exit", exited)
      child.stdout?.resume()
      child.stderr?.resume()
    }
    child.stdout?.on("data", take)
    child.stderr?.on("data", take)
    child.once("exit", exited)
  })
}
