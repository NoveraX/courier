import { Router } from "express"

import { getNextUserId, type Post, posts, type User, users } from "../data"
import { email, fieldsOf, role, text, wholeNumber } from "../fields"
import type { DemoLimits } from "../limits"
import { invalidField, Refusal } from "../refusal"

const ID = { min: 1, max: Number.MAX_SAFE_INTEGER }

function found<TRecord>(records: ReadonlyMap<number, TRecord>, id: number, what: string): TRecord {
  const record = records.get(id)
  if (record === undefined) throw new Refusal(404, "NOT_FOUND", `No ${what} #${id}`)
  return record
}

/**
 * The users the examples list, create, change and delete, and a user's
 * post by both ids. Every field is checked against its limit before
 * anything is kept, and a change keeps only the fields a user has.
 *
 * @param limits - The backend's limits
 * @returns The router, mounted at `/users`
 * @example
 * ```ts
 * app.use("/users", usersRouter(DEMO_LIMITS))
 * ```
 */
export function usersRouter(limits: DemoLimits): Router {
  const router = Router()
  const named = (value: unknown) => text(value, "name", limits.nameLength)
  const addressed = (value: unknown) => email(value, limits.emailLength)

  router.get("/", (req, res) => {
    const { page: pageAsked, limit: limitAsked, search: searchAsked } = req.query
    const page =
      pageAsked === undefined ? 1 : wholeNumber(pageAsked, "page", { min: 1, max: limits.lastPage })
    const limit =
      limitAsked === undefined
        ? 10
        : wholeNumber(limitAsked, "limit", { min: 1, max: limits.pageSize })
    const search =
      searchAsked === undefined || searchAsked === ""
        ? ""
        : text(searchAsked, "search", limits.searchLength).toLowerCase()
    const matching = [...users.values()].filter(
      (user) =>
        user.name.toLowerCase().includes(search) || user.email.toLowerCase().includes(search)
    )
    const start = (page - 1) * limit
    res.json({ data: matching.slice(start, start + limit), total: matching.length, page, limit })
  })

  router.get("/:id", (req, res) => {
    res.json(found(users, wholeNumber(req.params.id, "id", ID), "user"))
  })

  router.get("/:id/posts/:postId", (req, res) => {
    const user = found(users, wholeNumber(req.params.id, "id", ID), "user")
    const postId = wholeNumber(req.params.postId, "postId", ID)
    const post: Post = found(posts, postId, "post")
    if (post.userId !== user.id)
      throw new Refusal(404, "NOT_FOUND", `User #${user.id} has no post #${postId}`)
    res.json({ user, post })
  })

  router.post("/", (req, res) => {
    const fields = fieldsOf(req.body)
    const id = getNextUserId()
    const user: User = {
      id,
      name: named(fields.name),
      email: addressed(fields.email),
      role: fields.role === undefined ? "user" : role(fields.role),
      createdAt: new Date().toISOString(),
    }
    users.set(id, user)
    res.status(201).json(user)
  })

  router.put("/:id", (req, res) => {
    const existing = found(users, wholeNumber(req.params.id, "id", ID), "user")
    const fields = fieldsOf(req.body)
    const user: User = {
      ...existing,
      name: named(fields.name),
      email: addressed(fields.email),
      role: role(fields.role),
    }
    users.set(user.id, user)
    res.json(user)
  })

  router.patch("/:id", (req, res) => {
    const existing = found(users, wholeNumber(req.params.id, "id", ID), "user")
    const fields = fieldsOf(req.body)
    if (fields.name === undefined && fields.email === undefined && fields.role === undefined) {
      throw invalidField("the body", "at least one of name, email and role")
    }
    const user: User = {
      ...existing,
      ...(fields.name !== undefined && { name: named(fields.name) }),
      ...(fields.email !== undefined && { email: addressed(fields.email) }),
      ...(fields.role !== undefined && { role: role(fields.role) }),
    }
    users.set(user.id, user)
    res.json(user)
  })

  router.delete("/:id", (req, res) => {
    const user = found(users, wholeNumber(req.params.id, "id", ID), "user")
    users.delete(user.id)
    res.status(204).end()
  })

  return router
}
