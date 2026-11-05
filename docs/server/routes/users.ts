import { Router } from "express"

import { addUser, changeUser, postIn, userIn } from "../data/records"
import { email, fieldsOf, role, text, wholeNumber } from "../fields"
import type { DemoLimits } from "../limits"
import { invalidField, Refusal } from "../refusal"
import type { Visits } from "../visitor"

const ID = { min: 1, max: Number.MAX_SAFE_INTEGER }

/**
 * The users the examples list, create, change and delete, and a user's
 * post by both ids — the users of the visitor who calls. Every field is
 * checked against its limit before anything is kept, and a change keeps
 * only the fields a user has.
 *
 * @param limits - The backend's limits
 * @param visits - The data of the visitor each call comes from
 * @returns The router, mounted at `/users`
 * @example
 * ```ts
 * app.use("/users", usersRouter(DEMO_LIMITS, visits))
 * ```
 */
export function usersRouter(limits: DemoLimits, visits: Visits): Router {
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
    const matching = [...visits.read(req).users.values()].filter(
      (user) =>
        user.name.toLowerCase().includes(search) || user.email.toLowerCase().includes(search)
    )
    const start = (page - 1) * limit
    res.json({ data: matching.slice(start, start + limit), total: matching.length, page, limit })
  })

  router.get("/:id", (req, res) => {
    res.json(userIn(visits.read(req), wholeNumber(req.params.id, "id", ID)))
  })

  router.get("/:id/posts/:postId", (req, res) => {
    const data = visits.read(req)
    const user = userIn(data, wholeNumber(req.params.id, "id", ID))
    const post = postIn(data, wholeNumber(req.params.postId, "postId", ID))
    if (post.userId !== user.id) {
      throw new Refusal(404, "NOT_FOUND", `User #${user.id} has no post #${post.id}`)
    }
    res.json({ user, post })
  })

  router.post("/", async (req, res) => {
    const fields = fieldsOf(req.body)
    const user = {
      name: named(fields.name),
      email: addressed(fields.email),
      role: fields.role === undefined ? "user" : role(fields.role),
    } as const
    const making = { most: limits.usersPerVisitor, at: new Date() }
    res.status(201).json(await visits.change(req, res, (data) => addUser(data, user, making)))
  })

  router.put("/:id", async (req, res) => {
    const id = wholeNumber(req.params.id, "id", ID)
    const fields = fieldsOf(req.body)
    const user = {
      name: named(fields.name),
      email: addressed(fields.email),
      role: role(fields.role),
    }
    res.json(await visits.change(req, res, (data) => changeUser(data, id, user)))
  })

  router.patch("/:id", async (req, res) => {
    const id = wholeNumber(req.params.id, "id", ID)
    const fields = fieldsOf(req.body)
    if (fields.name === undefined && fields.email === undefined && fields.role === undefined) {
      throw invalidField("the body", "at least one of name, email and role")
    }
    const changes = {
      ...(fields.name !== undefined && { name: named(fields.name) }),
      ...(fields.email !== undefined && { email: addressed(fields.email) }),
      ...(fields.role !== undefined && { role: role(fields.role) }),
    }
    res.json(await visits.change(req, res, (data) => changeUser(data, id, changes)))
  })

  router.delete("/:id", async (req, res) => {
    const id = wholeNumber(req.params.id, "id", ID)
    await visits.change(req, res, (data) => data.users.delete(userIn(data, id).id))
    res.status(204).end()
  })

  return router
}
