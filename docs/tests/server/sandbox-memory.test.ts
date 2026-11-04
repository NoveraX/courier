/**
 * The store's memory at its fullest: every visitor it keeps at once, each
 * with as many users and posts as one may keep, every field as long as its
 * limit lets it be and written in characters that take two bytes each.
 * The records are read from JSON and through the backend's own checks, as
 * a call's are, and what the heap grew by once they are all kept is held
 * to the budget `limits.ts` names.
 */
import { setFlagsFromString } from "node:v8"
import { runInNewContext } from "node:vm"

import { describe, expect, it } from "vitest"

import { addPost, addUser } from "../../server/data/records"
import { SandboxStore } from "../../server/data/sandbox-store"
import { email, text } from "../../server/fields"
import { DEMO_LIMITS } from "../../server/limits"

const BUDGET_BYTES = 40 * 1024 * 1024

function collectGarbage(): void {
  setFlagsFromString("--expose-gc")
  const gc: unknown = runInNewContext("gc")
  if (typeof gc !== "function") throw new Error("The heap cannot be collected here")
  gc()
}

/* A character outside Latin-1, which the heap keeps in two bytes. */
const WIDE = "\u20ac"

/* A field as a call's JSON carries it: a flat string, unlike one built by repeating another. */
function field(length: number, unique: number): string {
  const tail = unique.toString(36)
  return JSON.parse(JSON.stringify(WIDE.repeat(length - tail.length) + tail))
}

function fill(store: SandboxStore): void {
  const limits = DEMO_LIMITS
  let unique = 0
  for (let visitor = 0; visitor < limits.visitors; visitor += 1) {
    const { visitor: id } = store.change(undefined, () => undefined)
    store.change(id, (data) => {
      const at = new Date()
      while (data.users.size < limits.usersPerVisitor) {
        unique += 1
        const user = {
          name: text(field(limits.nameLength, unique), "name", limits.nameLength),
          email: email(`${field(limits.emailLength - 8, unique)}@test.io`, limits.emailLength),
          role: "user",
        } as const
        addUser(data, user, { most: limits.usersPerVisitor, at })
      }
      while (data.posts.size < limits.postsPerVisitor) {
        unique += 1
        const post = {
          userId: 1,
          title: text(field(limits.titleLength, unique), "title", limits.titleLength),
          body: text(field(limits.bodyLength, unique), "body", limits.bodyLength),
          tags: Array.from({ length: limits.tags }, (_, tag) =>
            text(field(limits.tagLength, unique * 8 + tag), "a tag", limits.tagLength)
          ),
        }
        addPost(data, post, { most: limits.postsPerVisitor, at })
      }
    })
  }
}

describe("the store at its fullest", () => {
  it("holds every visitor's data within its budget", () => {
    collectGarbage()
    const before = process.memoryUsage().heapUsed
    const store = new SandboxStore(DEMO_LIMITS)
    fill(store)
    collectGarbage()
    const grown = process.memoryUsage().heapUsed - before
    expect(store.size).toBe(DEMO_LIMITS.visitors)
    /* Far above what keeping nothing would cost, so the measure saw the records. */
    expect(grown).toBeGreaterThan(BUDGET_BYTES / 4)
    expect(grown).toBeLessThanOrEqual(BUDGET_BYTES)
    console.info(`The store at its fullest: ${(grown / 1024 / 1024).toFixed(1)} MiB`)
  })
})
