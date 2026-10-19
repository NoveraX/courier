/**
 * The site's IndexNow key, served from its root: a search engine accepts a
 * list of changed pages only when `/<key>.txt` holds that very key.
 */
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

const PUBLIC = fileURLToPath(new URL("../../public", import.meta.url))
const KEY_FILE = /^([0-9a-f]{32})\.txt$/

describe("the IndexNow key file", () => {
  const keys = readdirSync(PUBLIC).flatMap((name) => {
    const key = KEY_FILE.exec(name)?.[1]
    return key ? [{ name, key }] : []
  })

  it("is one, at the root of the site", () => {
    expect(keys).toHaveLength(1)
  })

  it("holds its own key and nothing else", () => {
    for (const { name, key } of keys) {
      expect(readFileSync(path.join(PUBLIC, name), "utf8")).toBe(key)
    }
  })
})
