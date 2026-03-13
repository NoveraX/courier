import { existsSync, rmSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  getCachedDigest,
  getCachedFingerprints,
  loadCache,
  loadDigestCache,
  removeCachedDigest,
  removeCachedSource,
  saveCache,
  saveDigestCache,
  updateCachedDigest,
  updateCachedFingerprints,
} from "../src/apis/registry/cache"
import type { SpecDigest } from "../src/apis/merge/types"

const TEST_CACHE_PATH = join(import.meta.dirname, ".tmp-test-cache.json")
const TEST_DIGEST_PATH = join(import.meta.dirname, ".tmp-test-digests.json")

afterEach(() => {
  if (existsSync(TEST_CACHE_PATH)) rmSync(TEST_CACHE_PATH)
  if (existsSync(TEST_DIGEST_PATH)) rmSync(TEST_DIGEST_PATH)
})

describe("loadCache", () => {
  it("returns empty object when file does not exist", () => {
    const cache = loadCache(TEST_CACHE_PATH)
    expect(cache).toEqual({})
  })

  it("loads saved cache from disk", () => {
    const cache = { petstore: { getAll: "abc123" } }
    saveCache(cache, TEST_CACHE_PATH)
    const loaded = loadCache(TEST_CACHE_PATH)
    expect(loaded.petstore?.getAll).toBe("abc123")
  })
})

describe("getCachedFingerprints", () => {
  it("returns fingerprints for existing source", () => {
    const cache = { api: { getAll: "a", create: "b" } }
    expect(getCachedFingerprints(cache, "api")).toEqual({ getAll: "a", create: "b" })
  })

  it("returns empty object for unknown source", () => {
    expect(getCachedFingerprints({}, "nope")).toEqual({})
  })
})

describe("updateCachedFingerprints", () => {
  it("adds fingerprints for a new source", () => {
    const updated = updateCachedFingerprints({}, "api", { getAll: "abc" })
    expect(updated.api).toEqual({ getAll: "abc" })
  })

  it("replaces fingerprints for existing source", () => {
    const cache = { api: { getAll: "old" } }
    const updated = updateCachedFingerprints(cache, "api", { getAll: "new", create: "new2" })
    expect(updated.api).toEqual({ getAll: "new", create: "new2" })
  })
})

describe("removeCachedSource", () => {
  it("removes a source from cache", () => {
    const cache = { api: { getAll: "a" }, cms: { list: "b" } }
    const updated = removeCachedSource(cache, "api")
    expect(updated.api).toBeUndefined()
    expect(updated.cms).toEqual({ list: "b" })
  })

  it("does not throw when removing non-existent source", () => {
    const updated = removeCachedSource({}, "nope")
    expect(updated).toEqual({})
  })
})

// ── Digest Cache ────────────────────────────────────────────────────────────

const MOCK_DIGEST: SpecDigest = {
  _kind: "digest",
  groups: [{ name: "users", endpoints: [] }],
  schemas: {},
}

describe("loadDigestCache", () => {
  it("returns empty object when file does not exist", () => {
    const cache = loadDigestCache(TEST_DIGEST_PATH)
    expect(cache).toEqual({})
  })

  it("loads saved digest cache from disk", () => {
    saveDigestCache({ api: MOCK_DIGEST }, TEST_DIGEST_PATH)
    const loaded = loadDigestCache(TEST_DIGEST_PATH)
    expect(loaded.api).toBeDefined()
    expect(loaded.api?._kind).toBe("digest")
  })
})

describe("getCachedDigest", () => {
  it("returns digest for existing source", () => {
    const cache = { api: MOCK_DIGEST }
    const digest = getCachedDigest(cache, "api")
    expect(digest).toEqual(MOCK_DIGEST)
  })

  it("returns null for unknown source", () => {
    expect(getCachedDigest({}, "nope")).toBeNull()
  })

  it("migrates legacy digest without _kind field", () => {
    const legacy = { groups: [], schemas: {} } as unknown as SpecDigest
    const cache = { api: legacy }
    const digest = getCachedDigest(cache, "api")
    expect(digest?._kind).toBe("digest")
  })
})

describe("updateCachedDigest", () => {
  it("adds digest for a new source", () => {
    const updated = updateCachedDigest({}, "api", MOCK_DIGEST)
    expect(updated.api).toEqual(MOCK_DIGEST)
  })

  it("replaces digest for existing source", () => {
    const cache = { api: MOCK_DIGEST }
    const newDigest: SpecDigest = { ...MOCK_DIGEST, groups: [] }
    const updated = updateCachedDigest(cache, "api", newDigest)
    expect(updated.api?.groups).toHaveLength(0)
  })
})

describe("removeCachedDigest", () => {
  it("removes a digest from cache", () => {
    const cache = { api: MOCK_DIGEST, cms: MOCK_DIGEST }
    const updated = removeCachedDigest(cache, "api")
    expect(updated.api).toBeUndefined()
    expect(updated.cms).toBeDefined()
  })

  it("does not throw when removing non-existent source", () => {
    const updated = removeCachedDigest({}, "nope")
    expect(updated).toEqual({})
  })
})
