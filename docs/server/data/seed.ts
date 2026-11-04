import type { DemoData, DemoView, Post, User } from "./types"

const USERS: readonly User[] = [
  {
    id: 1,
    name: "Alice Johnson",
    email: "alice@example.com",
    role: "admin",
    createdAt: "2025-01-15T10:00:00Z",
  },
  {
    id: 2,
    name: "Bob Smith",
    email: "bob@example.com",
    role: "user",
    createdAt: "2025-02-20T14:30:00Z",
  },
  {
    id: 3,
    name: "Carol Williams",
    email: "carol@example.com",
    role: "moderator",
    createdAt: "2025-03-10T09:15:00Z",
  },
]

const POSTS: readonly Post[] = [
  {
    id: 1,
    userId: 1,
    title: "Getting Started with Courier",
    body: "Courier is a type-safe HTTP client...",
    tags: ["courier", "tutorial"],
    createdAt: "2025-03-01T12:00:00Z",
  },
  {
    id: 2,
    userId: 1,
    title: "Proxy Mode vs Direct Mode",
    body: "Understanding the two modes of operation...",
    tags: ["courier", "architecture"],
    createdAt: "2025-03-05T08:00:00Z",
  },
  {
    id: 3,
    userId: 2,
    title: "Request Groups Explained",
    body: "How to organize your API calls with groups...",
    tags: ["courier", "patterns"],
    createdAt: "2025-03-08T16:00:00Z",
  },
  {
    id: 4,
    userId: 3,
    title: "Error Handling Best Practices",
    body: "Using HTTPError and isHTTPError for robust error handling...",
    tags: ["courier", "errors"],
    createdAt: "2025-03-10T11:00:00Z",
  },
]

/**
 * A record that can be shared: neither it nor a list in it can be
 * changed, so a visitor's copy of the data holds the same records as the
 * first data until it replaces one.
 *
 * @param record - The record
 * @returns The same record, frozen
 * @example
 * ```ts
 * frozen({ ...user, name: "Jane" })
 * ```
 */
export function frozen<TRecord extends User | Post>(record: TRecord): TRecord {
  if ("tags" in record) Object.freeze(record.tags)
  return Object.freeze(record)
}

/**
 * The examples' first data, as every visitor first reads it. No call
 * changes it: a visitor's first change is made to a copy of it, which
 * is theirs alone.
 */
export const SEED: DemoView = {
  users: new Map(USERS.map((user) => [user.id, frozen({ ...user })])),
  posts: new Map(POSTS.map((post) => [post.id, frozen({ ...post, tags: [...post.tags] })])),
}

/**
 * A visitor's own copy of the examples' first data, holding the same
 * records, which cannot change, in maps of its own.
 *
 * @returns The copy
 * @example
 * ```ts
 * const data = copyOfSeed()
 * data.users.delete(1) // the first data still has Alice
 * ```
 */
export function copyOfSeed(): DemoData {
  return {
    users: new Map(SEED.users),
    posts: new Map(SEED.posts),
    nextUserId: Math.max(...SEED.users.keys()) + 1,
    nextPostId: Math.max(...SEED.posts.keys()) + 1,
  }
}
