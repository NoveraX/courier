/**
 * How the site's proxy route holds an example's upload: not at all. It
 * reads the call's options, then sends the rest on to the backend as it
 * arrives, so the backend counts the call against its caller's budget
 * before any of the file has come — refusing one past it at once — and an
 * upload still being sent holds no more of the site's memory than its
 * pieces in flight, however large its file.
 *
 * The backend runs in a process of its own, as the site's container runs
 * it, so that the memory measured is the site's alone: a backend in the
 * site's process would add what it is still taking in. Between the two is
 * a link that takes all the route sends at once — as Linux's socket
 * buffers take a whole file before the backend has read any of it — and
 * hands it on once the files are sent, so that on every system the backend
 * is still taking them in as the site's memory is measured.
 */
import type { ChildProcess } from "node:child_process"
import { once } from "node:events"
import { setFlagsFromString } from "node:v8"
import { runInNewContext } from "node:vm"

import { createHandler, registerSources } from "@noverax/courier/server"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { EXAMPLES_PROXY } from "@/app/api/request/examples-proxy"
import { DEMO_LIMITS } from "../../server/limits"
import { addressOf, startBackend } from "../server/backend-process"
import { type Link, startLink } from "../server/link"

/* A loopback name: outside production, Courier's proxy serves no other host. */
const SITE = "https://courier.localhost"
const BOUNDARY = "----example-upload"
const CHUNK = 64 * 1024

let backend: ChildProcess
let link: Link
let proxy: ReturnType<typeof createHandler>

beforeAll(async () => {
  backend = startBackend()
  link = await startLink(await addressOf(backend))
  /* The sources read the backend's address as they load. */
  process.env.API_URL = link.url
  registerSources((await import("@/api")).sources)
  proxy = createHandler(EXAMPLES_PROXY)
})

afterAll(async () => {
  link.close()
  if (backend.exitCode !== null || backend.signalCode !== null) return
  const exited = once(backend, "exit")
  backend.kill("SIGKILL")
  await exited
})

function collectGarbage(): void {
  setFlagsFromString("--expose-gc")
  const gc: unknown = runInNewContext("gc")
  if (typeof gc !== "function") throw new Error("The heap cannot be collected here")
  gc()
}

/* The array buffers still held once the collector is done: it frees a collected buffer's bytes
   after the collection itself, later on a busy machine, so the measure waits for them to stop
   falling. */
async function heldArrayBuffers(): Promise<number> {
  let held = Number.POSITIVE_INFINITY
  for (let round = 0; round < 40; round += 1) {
    collectGarbage()
    await new Promise((resolve) => setTimeout(resolve, 25))
    const now = process.memoryUsage().arrayBuffers
    if (now > held - CHUNK) return Math.min(now, held)
    held = now
  }
  return held
}

/* What keeps the rest of an upload back, and what lets it come. */
function holdBack(): { held: Promise<void>; release: () => void } {
  let release = () => {}
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  return { held, release }
}

/* An upload of the largest file the example takes, as the site's client writes one, options
   first: the first `sent` bytes of its file come at once, the rest of it — and the closing
   delimiter — once `held` settles. Each piece is made as it is asked for, so that none is the
   test's own to hold. `read` counts what the route has taken of it. */
function upload(
  sent: number,
  held: Promise<void>,
  read = { bytes: 0 }
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  const head = encoder.encode(
    `--${BOUNDARY}\r\nContent-Disposition: form-data; name="_options"\r\n\r\n{}\r\n` +
      `--${BOUNDARY}\r\nContent-Disposition: form-data; name="file"; filename="photo.jpg"\r\n` +
      "Content-Type: image/jpeg\r\n\r\n"
  )
  let headed = false
  let fileBytes = 0
  let ended = false
  return new ReadableStream({
    async pull(controller) {
      if (ended) return controller.close()
      let piece: Uint8Array
      if (!headed) {
        headed = true
        piece = head
      } else {
        if (fileBytes >= sent) await held
        if (fileBytes < DEMO_LIMITS.uploadBytes) {
          piece = new Uint8Array(Math.min(CHUNK, DEMO_LIMITS.uploadBytes - fileBytes))
          fileBytes += piece.byteLength
        } else {
          piece = encoder.encode(`\r\n--${BOUNDARY}--\r\n`)
          ended = true
        }
      }
      read.bytes += piece.byteLength
      controller.enqueue(piece)
    },
  })
}

/* A page's call from a user at `address`, as the deployment's proxy in front reports them. */
function call(address: string, route: string, body: BodyInit, type: string): Promise<Response> {
  const [group, method] = route.split(".")
  return proxy.handlePost(
    new Request(`${SITE}/api/request?_s=api&_g=${group}&_m=${method}`, {
      method: "POST",
      headers: {
        origin: SITE,
        "sec-fetch-site": "same-origin",
        "x-forwarded-for": address,
        "content-type": type,
      },
      body,
      duplex: "half",
    } as RequestInit)
  )
}

const MULTIPART = `multipart/form-data; boundary=${BOUNDARY}`

/* What `answer` came to within `ms`, or `undefined` if it had not. */
function within<T>(ms: number, answer: Promise<T>): Promise<T | undefined> {
  return Promise.race([answer, new Promise<undefined>((resolve) => setTimeout(resolve, ms))])
}

describe("an upload", () => {
  it("past its caller's budget is answered at once, before its file has come", async () => {
    const address = "198.51.100.30"
    /* The encoding example's echo: writes that make no visitor a copy of the data. */
    const echo = JSON.stringify({ variables: { text: "hi" }, options: {} })
    for (let write = 0; write < DEMO_LIMITS.writes; write += 1) {
      expect((await call(address, "echo.send", echo, "application/json")).status).toBe(200)
    }
    const { held, release } = holdBack()
    const answer = call(address, "files.upload", upload(CHUNK, held), MULTIPART)
    try {
      const refused = await within(2_000, answer)
      expect(refused?.status).toBe(429)
      expect(await refused?.json()).toMatchObject({ code: "RATE_LIMITED" })
    } finally {
      release()
      await answer
    }
  })

  it("still being sent holds no more of the site's memory than its pieces in flight", async () => {
    const uploads = 20
    const reads = Array.from({ length: uploads }, () => ({ bytes: 0 }))
    const sentWhole = () => reads.every(({ bytes }) => bytes > DEMO_LIMITS.uploadBytes)
    const { held, release } = holdBack()
    const before = await heldArrayBuffers()
    /* None of the files reaches the backend before all of them are sent. */
    await link.hold()
    const answers = reads.map((read, index) =>
      call(
        `198.51.100.${40 + index}`,
        "files.upload",
        upload(DEMO_LIMITS.uploadBytes, held, read),
        MULTIPART
      )
    )
    try {
      /* Every file sent whole, its upload kept open by the closing delimiter alone. */
      for (let wait = 0; wait < 750 && !sentWhole(); wait += 1) {
        await new Promise((resolve) => setTimeout(resolve, 20))
      }
      expect(sentWhole()).toBe(true)
      /* The backend takes them in as the site's memory is measured. */
      await link.release()
      const grown = (await heldArrayBuffers()) - before
      console.info(`${uploads} uploads being sent hold ${(grown / 1024).toFixed(0)} KiB`)
      /* Kept, as Courier keeps an upload by default, each would hold its whole file. */
      expect(grown).toBeLessThan((uploads * DEMO_LIMITS.uploadBytes) / 4)
    } finally {
      release()
    }
    for (const answer of await Promise.all(answers)) {
      expect(answer.status).toBe(200)
      expect(await answer.json()).toMatchObject({ file: { size: DEMO_LIMITS.uploadBytes } })
    }
  }, 30_000)
})
