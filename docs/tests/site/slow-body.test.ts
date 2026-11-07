/**
 * A body slower than the examples' backend waits for is refused by the
 * site's proxy route itself, in Courier's JSON, before the backend cuts
 * the call off with nothing said: the route gives up on a body within
 * `bodyMs`, and on its next piece within `bodyIdleMs`, both inside the
 * backend's `requestMs`. The backend's window is scaled down here from
 * 30 s to 2 s, and the route's deadlines with it.
 */
import { once } from "node:events"
import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"

import { createHandler, registerSources } from "@noverax/courier/server"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { EXAMPLES_PROXY, examplesProxy } from "@/app/api/request/examples-proxy"
import { createDemoApp } from "../../server/app"
import { DEMO_LIMITS } from "../../server/limits"

/* A loopback name: outside production, Courier's proxy serves no other host. */
const SITE = "https://courier.localhost"
const BOUNDARY = "----slow-upload"
const CHUNK = 64 * 1024
const LIMITS = {
  ...DEMO_LIMITS,
  requestMs: 2_000,
  headersMs: 1_000,
  bodyMs: 1_500,
  bodyIdleMs: 1_000,
}

let backend: Server
let proxy: ReturnType<typeof createHandler>

beforeAll(async () => {
  /* As server/index.ts serves it, its connections checked often enough for a window of 2 s. */
  backend = createServer(
    {
      requestTimeout: LIMITS.requestMs,
      headersTimeout: LIMITS.headersMs,
      connectionsCheckingInterval: 100,
    },
    createDemoApp({ limits: LIMITS, log: () => {} })
  )
  backend.listen(0, "127.0.0.1")
  await once(backend, "listening")
  /* The sources read the backend's address as they load. */
  process.env.API_URL = `http://127.0.0.1:${(backend.address() as AddressInfo).port}`
  registerSources((await import("@/api")).sources)
  proxy = createHandler(examplesProxy(LIMITS))
})

afterAll(() => {
  backend.closeAllConnections()
  backend.close()
})

/* The largest file the example takes, its options first, then a piece of it every `everyMs`. */
function upload(everyMs: number): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  const head = encoder.encode(
    `--${BOUNDARY}\r\nContent-Disposition: form-data; name="_options"\r\n\r\n{}\r\n` +
      `--${BOUNDARY}\r\nContent-Disposition: form-data; name="file"; filename="photo.jpg"\r\n` +
      "Content-Type: application/octet-stream\r\n\r\n"
  )
  let headed = false
  let sent = 0
  return new ReadableStream({
    async pull(controller) {
      if (!headed) {
        headed = true
        return controller.enqueue(head)
      }
      if (everyMs > 0) await new Promise((resolve) => setTimeout(resolve, everyMs))
      if (sent < LIMITS.uploadBytes) {
        const piece = new Uint8Array(Math.min(CHUNK, LIMITS.uploadBytes - sent))
        sent += piece.byteLength
        return controller.enqueue(piece)
      }
      controller.enqueue(encoder.encode(`\r\n--${BOUNDARY}--\r\n`))
      controller.close()
    },
  })
}

/* The upload through the proxy route, from a caller of its own: its status and its answer. */
async function send(everyMs: number, address: string): Promise<[number, unknown]> {
  const response = await proxy.handlePost(
    new Request(`${SITE}/api/request?_s=api&_g=files&_m=upload`, {
      method: "POST",
      headers: {
        origin: SITE,
        "sec-fetch-site": "same-origin",
        "x-forwarded-for": address,
        "content-type": `multipart/form-data; boundary=${BOUNDARY}`,
      },
      body: upload(everyMs),
      duplex: "half",
    } as RequestInit)
  )
  const text = await response.text()
  return [response.status, text === "" ? null : JSON.parse(text)]
}

describe("an upload", () => {
  it("that arrives in time is passed on", async () => {
    const [status, answer] = await send(0, "198.51.100.40")
    expect(status).toBe(200)
    expect(answer).toMatchObject({ file: { size: LIMITS.uploadBytes } })
  })

  it("too slow for the backend's window is refused by the route itself, in JSON", async () => {
    /* Sixteen pieces, one each 250 ms: some 4 s, twice the backend's window. */
    const [status, answer] = await send(250, "198.51.100.41")
    expect(status).toBe(408)
    expect(answer).toMatchObject({ success: false, code: "BODY_TIMEOUT" })
  })
})

describe("the route's deadlines for a body", () => {
  it("fall within the backend's window for the whole call", () => {
    expect(EXAMPLES_PROXY.bodyTimeoutMs).toBeLessThan(DEMO_LIMITS.requestMs)
    expect(EXAMPLES_PROXY.bodyIdleTimeoutMs).toBeLessThanOrEqual(EXAMPLES_PROXY.bodyTimeoutMs)
  })
})
