/**
 * Regression tests: catalog converters must not crash on malformed
 * SourceMap input from connected apps.
 *
 * Apps may run a different Nexus version, be partially initialized, or
 * (in pathological cases) hand-roll the connection:init payload. The
 * studio dev server must survive any of these without throwing.
 */
import { describe, expect, it } from "vitest"

import {
  catalogFromRuntime,
  catalogFromScan,
  groupFromRuntime,
  sourceFromRuntime,
} from "../src/server/catalog/merge-converters"
import { mergeSource } from "../src/server/catalog/merge-source"
import { mergeOverlay } from "../src/server/catalog/merge-overlay"

describe("catalog converters — malformed input", () => {
  it("sourceFromRuntime: missing groups produces empty entry, not crash", () => {
    const result = sourceFromRuntime({ baseURL: "http://x" } as never)
    expect(result).toEqual({ baseURL: "http://x", groups: {} })
  })

  it("sourceFromRuntime: null source produces empty entry", () => {
    const result = sourceFromRuntime(null as never)
    expect(result).toEqual({ baseURL: "", groups: {} })
  })

  it("groupFromRuntime: missing endpoints produces empty group", () => {
    const result = groupFromRuntime({ prefix: "/foo" } as never)
    expect(result).toEqual({ prefix: "/foo", endpoints: {} })
  })

  it("catalogFromRuntime: tolerates partial source entries", () => {
    const malformed = {
      api: { baseURL: "http://x" }, // groups missing
      other: { baseURL: "http://y", groups: { users: { prefix: "/u" } } }, // endpoints missing
    }
    const result = catalogFromRuntime(malformed as never)
    expect(result.api).toEqual({ baseURL: "http://x", groups: {} })
    expect(result.other).toEqual({
      baseURL: "http://y",
      groups: { users: { prefix: "/u", endpoints: {} } },
    })
  })

  it("catalogFromScan: tolerates partial scan entries", () => {
    const result = catalogFromScan({ api: { baseURL: "http://x" } } as never)
    expect(result.api).toEqual({ baseURL: "http://x", groups: {} })
  })

  it("mergeSource: tolerates malformed runtime overlay", () => {
    const scan = {
      baseURL: "http://x",
      groups: {
        users: {
          prefix: "/users",
          endpoints: {
            getAll: { type: "query", hasVariablesSchema: false, hasResponseSchema: true, path: "" },
          },
        },
      },
    } as never
    // Runtime sends a partial source — no groups field
    const rt = { baseURL: "http://x" } as never
    const result = mergeSource(scan, rt)
    expect(result.groups.users).toBeDefined()
    expect(result.groups.users?.endpoints.getAll).toBeDefined()
  })

  it("mergeOverlay: tolerates entirely malformed runtime layer", () => {
    const runtimeLayers = new Map<string, never>()
    runtimeLayers.set("session_bad", { api: { baseURL: "http://x" } } as never)
    const result = mergeOverlay(null, runtimeLayers as never)
    expect(result.catalog.api).toEqual({ baseURL: "http://x", groups: {} })
  })
})
