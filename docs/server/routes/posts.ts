import { Router } from "express"

import { addPost, postIn } from "../data/records"
import { fieldsOf, text, wholeNumber } from "../fields"
import type { DemoLimits } from "../limits"
import { invalidField } from "../refusal"
import type { Visits } from "../visitor"

const ID = { min: 1, max: Number.MAX_SAFE_INTEGER }

/**
 * The posts the examples list and read, and create for one of the
 * visitor's users — the posts of the visitor who calls, every field
 * checked against its limit.
 *
 * @param limits - The backend's limits
 * @param visits - The data of the visitor each call comes from
 * @returns The router, mounted at `/posts`
 * @example
 * ```ts
 * app.use("/posts", postsRouter(DEMO_LIMITS, visits))
 * ```
 */
export function postsRouter(limits: DemoLimits, visits: Visits): Router {
  const router = Router()

  router.get("/", (req, res) => {
    const userId =
      req.query.userId === undefined ? undefined : wholeNumber(req.query.userId, "userId", ID)
    const items = [...visits.read(req).posts.values()].filter(
      (post) => userId === undefined || post.userId === userId
    )
    res.json({ data: items, total: items.length })
  })

  router.get("/:id", (req, res) => {
    res.json(postIn(visits.read(req), wholeNumber(req.params.id, "id", ID)))
  })

  router.post("/", (req, res) => {
    const fields = fieldsOf(req.body)
    const post = {
      userId: fields.userId === undefined ? 1 : wholeNumber(fields.userId, "userId", ID),
      title: text(fields.title, "title", limits.titleLength),
      body: text(fields.body, "body", limits.bodyLength),
      tags: tagsOf(fields.tags, limits),
    }
    const making = { most: limits.postsPerVisitor, at: new Date() }
    res.status(201).json(visits.change(req, res, (data) => addPost(data, post, making)))
  })

  return router
}

function tagsOf(value: unknown, limits: DemoLimits): string[] {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > limits.tags) {
    throw invalidField("tags", `a list of at most ${limits.tags} tags`)
  }
  return value.map((tag) => text(tag, "a tag", limits.tagLength))
}
