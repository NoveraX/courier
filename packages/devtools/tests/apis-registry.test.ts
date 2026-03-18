import { existsSync, readFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  addSource,
  computeSpecHash,
  getSource,
  hasSpecChanged,
  listSources,
  loadRegistry,
  removeSource,
  saveRegistry,
  updateSource,
} from "../src/apis/registry/registry"
import type { PersistedGenerateOptions, RegistryConfig } from "../src/apis/registry/types"
import { DEFAULT_OPTIONS } from "../src/apis/generator/types"

/** DEFAULT_OPTIONS already has selectedEndpoints: null — narrow the type for registry tests */
const PERSISTED_OPTIONS: PersistedGenerateOptions = DEFAULT_OPTIONS as PersistedGenerateOptions

const TEST_CONFIG_PATH = join(import.meta.dirname, ".tmp-test-registry.json")

afterEach(() => {
  if (existsSync(TEST_CONFIG_PATH)) {
    rmSync(TEST_CONFIG_PATH)
  }
})

import { makeSpec } from "./helpers/make-spec"

// ── loadRegistry / saveRegistry ─────────────────────────────────────────────

describe("loadRegistry", () => {
  it("returns empty config when file does not exist", () => {
    const config = loadRegistry(TEST_CONFIG_PATH)
    expect(config).toEqual({ sources: {} })
  })

  it("loads saved config from disk", () => {
    const config: RegistryConfig = {
      sources: {
        api: {
          specUrl: "https://example.com/spec.json",
          importType: "url",
          specHash: "abc123",
          options: PERSISTED_OPTIONS,
          userModified: [],
        },
      },
    }
    saveRegistry(config, TEST_CONFIG_PATH)
    const loaded = loadRegistry(TEST_CONFIG_PATH)
    expect(loaded.sources.api?.specHash).toBe("abc123")
  })
})

describe("saveRegistry", () => {
  it("writes config to disk with pretty JSON", () => {
    const config: RegistryConfig = { sources: {} }
    saveRegistry(config, TEST_CONFIG_PATH)
    const raw = readFileSync(TEST_CONFIG_PATH, "utf-8")
    expect(raw).toContain("{\n")
    expect(raw.endsWith("\n")).toBe(true)
  })
})

// ── CRUD ────────────────────────────────────────────────────────────────────

describe("addSource", () => {
  it("adds a new source to config", () => {
    let config: RegistryConfig = { sources: {} }
    const spec = makeSpec()

    config = addSource(
      config,
      "petstore",
      spec,
      "https://petstore.io/spec.json",
      "url",
      DEFAULT_OPTIONS,
      ["getById"],
    )

    expect(config.sources.petstore).toBeDefined()
    expect(config.sources.petstore?.userModified).toEqual(["getById"])
  })

  it("overwrites existing source with same name", () => {
    let config: RegistryConfig = { sources: {} }
    const spec1 = makeSpec({ version: "1.0.0" })
    const spec2 = makeSpec({ version: "2.0.0" })

    config = addSource(config, "api", spec1, "https://a.com", "url", DEFAULT_OPTIONS)
    config = addSource(config, "api", spec2, "https://a.com", "url", DEFAULT_OPTIONS)

    expect(computeSpecHash(spec2)).not.toBe(computeSpecHash(spec1))
    expect(config.sources.api?.specHash).toBe(computeSpecHash(spec2))
  })

  it("excludes selectedEndpoints from stored options", () => {
    let config: RegistryConfig = { sources: {} }
    const opts = { ...DEFAULT_OPTIONS, selectedEndpoints: { users: ["getAll"] } }
    config = addSource(config, "api", makeSpec(), "https://a.com", "url", opts)
    expect("selectedEndpoints" in (config.sources.api?.options ?? {})).toBe(false)
  })

  it("defaults userModified to empty array", () => {
    let config: RegistryConfig = { sources: {} }
    config = addSource(config, "api", makeSpec(), "https://a.com", "url", DEFAULT_OPTIONS)
    expect(config.sources.api?.userModified).toEqual([])
  })
})

describe("removeSource", () => {
  it("removes a source from config", () => {
    let config: RegistryConfig = { sources: {} }
    config = addSource(config, "api", makeSpec(), "https://a.com", "url", DEFAULT_OPTIONS)
    expect(getSource(config, "api")).toBeDefined()

    config = removeSource(config, "api")
    expect(getSource(config, "api")).toBeUndefined()
  })

  it("does not throw when removing non-existent source", () => {
    const config: RegistryConfig = { sources: {} }
    const result = removeSource(config, "nonexistent")
    expect(result.sources).toEqual({})
  })
})

describe("getSource", () => {
  it("returns source by name", () => {
    let config: RegistryConfig = { sources: {} }
    config = addSource(config, "api", makeSpec(), "https://a.com", "url", DEFAULT_OPTIONS)
    expect(getSource(config, "api")?.specHash).toBe(computeSpecHash(makeSpec()))
  })

  it("returns undefined for unknown source", () => {
    expect(getSource({ sources: {} }, "nope")).toBeUndefined()
  })
})

describe("listSources", () => {
  it("lists all sources with summary", () => {
    let config: RegistryConfig = { sources: {} }
    config = addSource(config, "api", makeSpec(), "https://a.com", "url", DEFAULT_OPTIONS)
    config = addSource(config, "cms", makeSpec({ version: "2.0.0" }), "", "file", DEFAULT_OPTIONS)

    const list = listSources(config)
    expect(list).toHaveLength(2)
    expect(list.find((s) => s.name === "api")).toBeDefined()
    expect(list.find((s) => s.name === "cms")?.importType).toBe("file")
  })
})

// ── Update Detection ────────────────────────────────────────────────────────

describe("computeSpecHash", () => {
  it("returns a 32-char hex string", () => {
    const hash = computeSpecHash(makeSpec())
    expect(hash).toMatch(/^[0-9a-f]{32}$/)
  })

  it("returns same hash for same spec", () => {
    const spec = makeSpec()
    expect(computeSpecHash(spec)).toBe(computeSpecHash(spec))
  })

  it("returns different hash for different spec", () => {
    const a = computeSpecHash(makeSpec({ version: "1.0.0" }))
    const b = computeSpecHash(makeSpec({ version: "2.0.0" }))
    expect(a).not.toBe(b)
  })
})

describe("hasSpecChanged", () => {
  it("returns false when spec has not changed", () => {
    const spec = makeSpec()
    let config: RegistryConfig = { sources: {} }
    config = addSource(config, "api", spec, "https://a.com", "url", DEFAULT_OPTIONS)
    expect(hasSpecChanged(config.sources.api!, spec)).toBe(false)
  })

  it("returns true when spec version changes", () => {
    const spec = makeSpec({ version: "1.0.0" })
    let config: RegistryConfig = { sources: {} }
    config = addSource(config, "api", spec, "https://a.com", "url", DEFAULT_OPTIONS)

    const newSpec = makeSpec({ version: "2.0.0" })
    expect(hasSpecChanged(config.sources.api!, newSpec)).toBe(true)
  })
})

describe("updateSource", () => {
  it("updates specHash and userModified", () => {
    let config: RegistryConfig = { sources: {} }
    const spec = makeSpec({ version: "1.0.0" })
    config = addSource(config, "api", spec, "https://a.com", "url", DEFAULT_OPTIONS)

    const newSpec = makeSpec({ version: "2.0.0" })
    config = updateSource(config, "api", computeSpecHash(newSpec), ["getById"])

    const source = config.sources.api!
    expect(source.specHash).toBe(computeSpecHash(newSpec))
    expect(source.userModified).toEqual(["getById"])
  })

  it("does nothing if source not found", () => {
    const config: RegistryConfig = { sources: {} }
    const result = updateSource(config, "nonexistent", "hash")
    expect(result.sources).toEqual({})
  })
})
