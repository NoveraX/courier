/**
 * @vitest-environment jsdom
 */
/**
 * Studio replays the requests it captured to each page that connects, so a
 * page that loads after traffic, or reloads, shows them. A page that was
 * already open merges the replay with what it holds: nothing twice, the
 * events it missed while disconnected filled in, its pins kept, and the
 * requests of a Studio that restarted since left in place. Clearing the log
 * tells Studio which requests the page kept.
 */
import { createServer } from "node:http"
import type { AddressInfo } from "node:net"

import { act, renderHook } from "@testing-library/react"
import { Server, type Socket as ServerSocket } from "socket.io"
import { io, type Socket } from "socket.io-client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const page = vi.hoisted(() => ({ socket: undefined as Socket | undefined }))
vi.mock("@/socket/socket-instance", () => ({ getSocket: () => page.socket }))

import { useStudioStore } from "@/store"
import type { RequestEntry } from "@/store"
import { useClearRequests } from "@/hooks/use-clear-requests"
import { buildBindings, unbind } from "@/socket/socket-bindings"

type Event = Record<string, unknown>

let server: Server | undefined
const stops: Array<() => void> = []

function event(type: string, id: string, extra: Event = {}): Event {
  return { id, type, timestamp: 1_000, sessionId: "server", ...(type !== "request:start" && { requestId: id }), ...extra }
}

function started(id: string): Event {
  return event("request:start", id, { source: "api", method: "list" })
}

/** A Studio that replays `replay` to each page that connects, and hands over its socket. */
async function studio(replay: Event[]): Promise<{ url: string; pages: ServerSocket[] }> {
  const http = createServer()
  server = new Server(http)
  const pages: ServerSocket[] = []
  server.of("/ui").on("connection", (socket) => {
    pages.push(socket)
    socket.emit("events:replay", replay)
  })
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve))
  return { url: `http://127.0.0.1:${(http.address() as AddressInfo).port}/ui`, pages }
}

async function connectPage(url: string): Promise<void> {
  const socket = io(url, { transports: ["websocket"] })
  page.socket = socket
  const bindings = buildBindings(socket, useStudioStore.getState)
  stops.push(() => {
    unbind(socket, bindings)
    socket.disconnect()
  })
  await new Promise<void>((resolve) => socket.once("connect", () => resolve()))
}

function entry(id: string, fields: Partial<RequestEntry> = {}): RequestEntry {
  return {
    id,
    source: "api",
    group: undefined,
    method: "list",
    variables: undefined,
    mode: "direct",
    status: "pending",
    middlewareCount: 0,
    middlewareEntries: [],
    hasValidation: { variables: false, response: false },
    startedAt: 500,
    sessionId: "server",
    ...fields,
  }
}

const ids = () => useStudioStore.getState().requests.map((r) => r.id)

beforeEach(() => {
  useStudioStore.setState({ requests: [], droppedRequests: 0, paused: false })
})

afterEach(async () => {
  for (const stop of stops.splice(0)) stop()
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()))
  server = undefined
})

describe("a page that connects", () => {
  it("shows the requests Studio captured before it", async () => {
    const { url } = await studio([started("r1"), event("request:end", "r1", { status: 200 }), started("r2")])

    await connectPage(url)

    await expect.poll(ids).toEqual(["r2", "r1"])
    expect(useStudioStore.getState().requests.find((r) => r.id === "r1")?.status).toBe("success")
  })

  it("merges the replay with what it already holds", async () => {
    useStudioStore.setState({
      requests: [entry("r1", { pinned: true, startedAt: 1_000 }), entry("old", { status: "success" })],
    })
    const { url } = await studio([started("r1"), event("request:end", "r1", { status: 200 })])

    await connectPage(url)

    await expect.poll(() => useStudioStore.getState().requests[0]?.status).toBe("success")
    expect(ids()).toEqual(["r1", "old"])
    expect(useStudioStore.getState().requests[0]?.pinned).toBe(true)
  })
})

describe("clearing the log", () => {
  it("tells Studio which requests the page kept", async () => {
    const { url, pages } = await studio([])
    const cleared: unknown[] = []
    await connectPage(url)
    pages[0]?.on("requests:clear", (payload: unknown) => cleared.push(payload))
    const { settings } = useStudioStore.getState()
    useStudioStore.setState({
      settings: { ...settings, preserveLog: true },
      requests: [entry("kept", { pinned: true }), entry("gone")],
    })
    const { result } = renderHook(() => useClearRequests())

    act(() => result.current())

    expect(ids()).toEqual(["kept"])
    await expect.poll(() => cleared).toEqual([{ keep: ["kept"] }])
  })
})
