/**
 * The examples' one Server Action that runs a sandbox's call on the
 * server: only the calls it names, each with an input from its page's own
 * choices. A name it does not know, or an input the page does not offer,
 * is refused before any call is made — whatever a script posts to it.
 */
import { afterEach, describe, expect, it, vi } from "vitest"

import { runOnServer, type ServerRunName } from "@/app/docs/examples/server-run"

afterEach(() => vi.restoreAllMocks())

describe("a call run on the server", () => {
  it("is refused, and nothing called, for a name the action does not know", async () => {
    const fetched = vi.spyOn(globalThis, "fetch")
    const run = await runOnServer("users.remove" as ServerRunName, 1)
    expect(run).toEqual({ refused: "No such call" })
    expect(fetched).not.toHaveBeenCalled()
  })

  it("is refused, and nothing called, for an input its page does not offer", async () => {
    const fetched = vi.spyOn(globalThis, "fetch")
    for (const [name, input] of [
      ["errors.error", 418],
      ["errors.error", "404"],
      ["options.slow", 60_000],
      ["options.slow", undefined],
    ] as const) {
      expect(await runOnServer(name, input)).toMatchObject({ refused: expect.any(String) })
    }
    expect(fetched).not.toHaveBeenCalled()
  })
})
