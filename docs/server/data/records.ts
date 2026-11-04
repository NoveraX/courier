import { Refusal } from "../refusal"
import { frozen } from "./seed"
import type { DemoData, DemoView, Post, User } from "./types"

/** How many records of a kind one visitor keeps, and the time a new one is made at. */
export interface Making {
  readonly most: number
  readonly at: Date
}

/**
 * A visitor's user by its id.
 *
 * @param data - The visitor's data
 * @param id - The user's id
 * @returns The user
 * @throws Refusal `NOT_FOUND`
 * @example
 * ```ts
 * userIn(store.read(visitor), 1).name // "Alice Johnson"
 * ```
 */
export function userIn(data: DemoView, id: number): User {
  const user = data.users.get(id)
  if (user === undefined) throw new Refusal(404, "NOT_FOUND", `No user #${id}`)
  return user
}

/**
 * A visitor's post by its id.
 *
 * @param data - The visitor's data
 * @param id - The post's id
 * @returns The post
 * @throws Refusal `NOT_FOUND`
 * @example
 * ```ts
 * postIn(store.read(visitor), 1).title // "Getting Started with Courier"
 * ```
 */
export function postIn(data: DemoView, id: number): Post {
  const post = data.posts.get(id)
  if (post === undefined) throw new Refusal(404, "NOT_FOUND", `No post #${id}`)
  return post
}

/**
 * Add a user to a visitor's data, under the next id they have.
 *
 * @param data - The visitor's data
 * @param fields - The user, checked
 * @param making - How many users a visitor keeps, and when the user is made
 * @returns The user
 * @throws Refusal `VISITOR_DATA_FULL` when the visitor keeps as many as they may
 * @example
 * ```ts
 * addUser(data, { name: "Jane", email: "jane@example.com", role: "user" }, { most: 30, at: new Date() })
 * ```
 */
export function addUser(
  data: DemoData,
  fields: Omit<User, "id" | "createdAt">,
  making: Making
): User {
  if (data.users.size >= making.most) throw full("users", making.most)
  const user = frozen({ ...fields, id: data.nextUserId, createdAt: making.at.toISOString() })
  data.users.set(user.id, user)
  data.nextUserId += 1
  return user
}

/**
 * Add a post to a visitor's data, for one of their users, under the next id they have.
 *
 * @param data - The visitor's data
 * @param fields - The post, checked
 * @param making - How many posts a visitor keeps, and when the post is made
 * @returns The post
 * @throws Refusal `NOT_FOUND` for a user they do not have, `VISITOR_DATA_FULL` past their posts
 * @example
 * ```ts
 * addPost(data, { userId: 1, title: "Hi", body: "…", tags: [] }, { most: 20, at: new Date() })
 * ```
 */
export function addPost(
  data: DemoData,
  fields: Omit<Post, "id" | "createdAt">,
  making: Making
): Post {
  userIn(data, fields.userId)
  if (data.posts.size >= making.most) throw full("posts", making.most)
  const post = frozen({ ...fields, id: data.nextPostId, createdAt: making.at.toISOString() })
  data.posts.set(post.id, post)
  data.nextPostId += 1
  return post
}

/**
 * Change a visitor's user: the fields given replace its own, and its id
 * and creation time stay.
 *
 * @param data - The visitor's data
 * @param id - The user's id
 * @param changes - The fields to change, checked
 * @returns The user as changed
 * @throws Refusal `NOT_FOUND`
 * @example
 * ```ts
 * changeUser(data, 2, { role: "moderator" })
 * ```
 */
export function changeUser(
  data: DemoData,
  id: number,
  changes: Partial<Omit<User, "id" | "createdAt">>
): User {
  const user = frozen({ ...userIn(data, id), ...changes })
  data.users.set(id, user)
  return user
}

function full(records: string, most: number): Refusal {
  return new Refusal(
    409,
    "VISITOR_DATA_FULL",
    `The examples keep up to ${most} ${records} for each visitor: delete one to add another`
  )
}
