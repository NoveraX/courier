/**
 * The examples' backend as its container runs it: started from
 * `server/index.ts` on a port the system picks, which it says it listens
 * on, and stopped with SIGTERM, as a container is — it takes no new
 * calls, lets the ones it is answering finish, and exits on its own.
 */
import { type ChildProcess, spawn } from "node:child_process"
import { once } from "node:events"
import { get } from "node:http"
import { fileURLToPath } from "node:url"

import { afterEach, describe, expect, it } from "vitest"

const DOCS = fileURLToPath(new URL("../..", import.meta.url))
const LISTENING = /listens on (http:\/\/127\.0\.0\.1:\d+)/

let backend: ChildProcess | undefined

afterEach(() => {
  if (backend?.exitCode === null && backend.signalCode === null) backend.kill("SIGKILL")
})

/* The backend's address, from the line it writes once it listens; its output, should it end first. */
function addressOf(child: ChildProcess): Promise<string> {
  let output = ""
  return new Promise((resolve, reject) => {
    child.stdout?.on("data", (chunk: Buffer) => {
      output += chunk.toString()
      const found = LISTENING.exec(output)?.[1]
      if (found !== undefined) resolve(found)
    })
    child.stderr?.on("data", (chunk: Buffer) => {
      output += chunk.toString()
    })
    child.once("exit", () => reject(new Error(`The backend exited before it listened:\n${output}`)))
  })
}

/* A streamed answer's whole body, and how it ended: complete, or cut off. */
function streamed(
  url: string,
  onFirstChunk: () => void
): Promise<{ body: string; complete: boolean }> {
  return new Promise((resolve) => {
    let body = ""
    const call = get(`${url}/stream`, { agent: false }, (response) => {
      response.once("data", onFirstChunk)
      response.on("data", (chunk: Buffer) => {
        body += chunk.toString()
      })
      response.once("end", () => resolve({ body, complete: response.complete }))
      response.once("error", () => resolve({ body, complete: false }))
    })
    call.once("error", () => resolve({ body, complete: false }))
  })
}

describe("the backend, asked to stop", () => {
  it("finishes the answer it is streaming, then exits by itself", async () => {
    backend = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
      cwd: DOCS,
      env: { ...process.env, EXPRESS_HOST: "127.0.0.1", EXPRESS_PORT: "0" },
    })
    const url = await addressOf(backend)
    const exited = once(backend, "exit")
    const answer = streamed(url, () => backend?.kill("SIGTERM"))
    const { body, complete } = await answer
    expect(complete).toBe(true)
    expect(body).toContain("data: [DONE]")
    expect(await exited).toEqual([0, null])
  }, 30_000)
})
