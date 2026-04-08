/**
 * Regression test: removing a Studio session must NOT wipe its requests.
 *
 * Scenario:
 * 1. Browser opens direct SSE/WS — emits stream:open with sessionId=A
 * 2. User triggers a proxy SSE/WS — server emits stream:open with sessionId=B
 * 3. Browser tab Fast Refresh / hard reload → session A disconnects
 *
 * Before the fix: removeSession(A) filtered all of A's requests out → only
 * proxy entry survived in Studio Timeline. Asymmetric and surprising.
 *
 * After the fix: removeSession(A) only updates the sessions list. The
 * direct entry stays so the user can still inspect it.
 */
import { describe, expect, it, beforeEach, vi } from "vitest"

import type { StudioState } from "../ui/src/store/store-types"
import { createInitialState } from "../ui/src/store/initial-state"
import { createActions } from "../ui/src/store/actions"
import { DEFAULT_SETTINGS } from "../ui/src/store/constants"

beforeEach(() => {
  ;(globalThis as { localStorage?: Storage }).localStorage = {
    getItem: () => null,
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
    key: () => null,
    length: 0,
  } as unknown as Storage
  ;(globalThis as { document?: Document }).document = {
    documentElement: { classList: { add: vi.fn(), remove: vi.fn() }, dataset: {} },
  } as unknown as Document
})

function freshStore() {
  let state: StudioState = {
    ...createInitialState("dark"),
    settings: { ...DEFAULT_SETTINGS },
  } as StudioState

  const get = () => state
  const set = (
    updater: Partial<StudioState> | ((s: StudioState) => Partial<StudioState>),
  ) => {
    const patch = typeof updater === "function" ? updater(state) : updater
    state = { ...state, ...patch }
  }

  const actions = createActions(set as never, get as never)
  state = { ...state, ...actions } as StudioState
  return get
}

function emitStreamOpen(
  get: () => StudioState,
  args: { requestId: string; sessionId: string; mode: "direct" | "proxy" },
) {
  get().handleEvent({
    type: "stream:open",
    timestamp: Date.now(),
    sessionId: args.sessionId,
    requestId: args.requestId,
    id: args.requestId,
    source: "api",
    group: "notifications",
    method: "feed",
    transport: "sse",
    mode: args.mode,
  } as never)
}

describe("removeSession — request retention", () => {
  it("keeps direct requests when browser session disconnects", () => {
    const get = freshStore()

    get().addSession({
      sessionId: "session_browser",
      framework: "next-client",
      nexusVersion: "0.0.0",
      connectedAt: Date.now(),
    })
    emitStreamOpen(get, {
      requestId: "req_direct_1",
      sessionId: "session_browser",
      mode: "direct",
    })

    get().addSession({
      sessionId: "session_server",
      framework: "next-server",
      nexusVersion: "0.0.0",
      connectedAt: Date.now(),
    })
    emitStreamOpen(get, {
      requestId: "req_proxy_1",
      sessionId: "session_server",
      mode: "proxy",
    })

    expect(get().requests).toHaveLength(2)

    // Browser session blip — Fast Refresh / Turbopack rebuild / hard reload
    get().removeSession("session_browser")

    // Direct entry survives the blip
    expect(get().requests).toHaveLength(2)
    expect(get().requests.map((r) => r.mode).sort()).toEqual(["direct", "proxy"])

    // sessions list does drop the disconnected one
    expect(get().sessions).toHaveLength(1)
    expect(get().sessions[0]?.sessionId).toBe("session_server")
  })

  it("keeps requests even when ALL sessions disconnect", () => {
    const get = freshStore()

    get().addSession({
      sessionId: "session_browser",
      framework: "next-client",
      nexusVersion: "0.0.0",
      connectedAt: Date.now(),
    })
    emitStreamOpen(get, {
      requestId: "req_direct_1",
      sessionId: "session_browser",
      mode: "direct",
    })

    get().removeSession("session_browser")

    // No active sessions, but the request log is intact
    expect(get().sessions).toHaveLength(0)
    expect(get().requests).toHaveLength(1)
  })

  it("clearRequests still wipes everything (explicit user action)", () => {
    const get = freshStore()

    get().addSession({
      sessionId: "s1",
      framework: "x",
      nexusVersion: "0",
      connectedAt: 0,
    })
    emitStreamOpen(get, { requestId: "r1", sessionId: "s1", mode: "direct" })
    emitStreamOpen(get, { requestId: "r2", sessionId: "s1", mode: "proxy" })

    expect(get().requests).toHaveLength(2)

    get().clearRequests()

    expect(get().requests).toHaveLength(0)
  })

  it("clearRequests with preserveLog=true keeps pinned requests", () => {
    const get = freshStore()
    get().updateSettings({ preserveLog: true })

    get().addSession({
      sessionId: "s1",
      framework: "x",
      nexusVersion: "0",
      connectedAt: 0,
    })
    emitStreamOpen(get, { requestId: "r1", sessionId: "s1", mode: "direct" })
    emitStreamOpen(get, { requestId: "r2", sessionId: "s1", mode: "proxy" })

    get().togglePin("r1")
    get().clearRequests()

    expect(get().requests).toHaveLength(1)
    expect(get().requests[0]?.id).toBe("r1")
  })
})
