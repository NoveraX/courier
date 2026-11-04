import type { Role } from "../fields"

/** A user of the examples' API. */
export interface User {
  readonly id: number
  readonly name: string
  readonly email: string
  readonly role: Role
  readonly createdAt: string
}

/** A post of the examples' API, written by one of its users. */
export interface Post {
  readonly id: number
  readonly userId: number
  readonly title: string
  readonly body: string
  readonly tags: readonly string[]
  readonly createdAt: string
}

/** The data a visitor's calls read: their own, or the examples' first data while they have none. */
export interface DemoView {
  readonly users: ReadonlyMap<number, User>
  readonly posts: ReadonlyMap<number, Post>
}

/** One visitor's own data, which only their calls change, and the ids their next records take. */
export interface DemoData extends DemoView {
  readonly users: Map<number, User>
  readonly posts: Map<number, Post>
  nextUserId: number
  nextPostId: number
}
