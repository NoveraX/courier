/**
 * The examples' backend as its container runs it: started from
 * `server/index.ts` on a port the system picks, which it says it listens
 * on, and stopped with SIGTERM, as a container is — it takes no new
 * calls, lets the ones it is answering finish, cuts off one that would
 * outlast the time it gives them, and exits on its own.
 */
import type { ChildProcess } from "node:child_process"
import { once } from "node:events"
import { get, request } from "node:http"

import { afterEach, describe, expect, it } from "vitest"

import { addressOf, startBackend } from "./backend-process"

/* As `server/limits.ts` has them: what the backend gives its calls once asked to stop, and how
   long it waits for a call to arrive, which a backend with no time to give would wait instead. */
const SHUTDOWN_MS = 5_000
const REQUEST_MS = 30_000

let backend: ChildProcess | undefined

afterEach(() => {
  if (backend?.exitCode === null && backend.signalCode === null) backend.kill("SIGKILL")
})

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

/* Not on Windows, which has no SIGTERM: Node ends a process sent one at once, before any handler
   runs, and no other signal it sends reaches one. The backend runs in its container's Linux. */
describe.skipIf(process.platform === "win32")("the backend, asked to stop", () => {
  it("finishes the answer it is streaming, then exits by itself", async () => {
    backend = startBackend()
    const url = await addressOf(backend)
    const exited = once(backend, "exit")
    const answer = streamed(url, () => backend?.kill("SIGTERM"))
    const { body, complete } = await answer
    expect(complete).toBe(true)
    expect(body).toContain("data: [DONE]")
    expect(await exited).toEqual([0, null])
  }, 30_000)

  it("cuts off a call still arriving once its time is up, then exits by itself", async () => {
    const started = startBackend()
    backend = started
    const url = new URL(await addressOf(started))
    const exited = once(started, "exit")
    /* An upload whose body never arrives whole: the backend has taken it once it says to go on. */
    const upload = request({
      hostname: url.hostname,
      port: url.port,
      path: "/upload",
      method: "POST",
      agent: false,
      headers: {
        "content-type": "multipart/form-data; boundary=x",
        "content-length": "100000",
        expect: "100-continue",
      },
    })
    const cut = new Promise<NodeJS.ErrnoException>((resolve) => upload.once("error", resolve))
    upload.once("continue", () => {
      upload.write('--x\r\nContent-Disposition: form-data; name="file"; filename="a.txt"\r\n\r\n')
      started.kill("SIGTERM")
    })
    upload.flushHeaders()
    const signalled = Date.now()
    expect((await cut).code).toBe("ECONNRESET")
    expect(await exited).toEqual([0, null])
    const took = Date.now() - signalled
    expect(took).toBeGreaterThanOrEqual(SHUTDOWN_MS - 500)
    expect(took).toBeLessThan(REQUEST_MS / 2)
  }, 30_000)
})
