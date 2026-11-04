import { Router } from "express"

import { getNextPostId, type Post, posts, users } from "../data"
import { fieldsOf, text, wholeNumber } from "../fields"
import type { DemoLimits } from "../limits"
import { invalidField, Refusal } from "../refusal"

const ID = { min: 1, max: Number.MAX_SAFE_INTEGER }

/**
 * The posts the examples list and read, and create for a user that
 * exists, every field checked against its limit.
 *
 * @param limits - The backend's limits
 * @returns The router, mounted at `/posts`
 * @example
 * ```ts
 * app.use("/posts", postsRouter(DEMO_LIMITS))
 * ```
 */
export function postsRouter(limits: DemoLimits): Router {
  const router = Router()

  router.get("/", (req, res) => {
    const userId =
      req.query.userId === undefined ? undefined : wholeNumber(req.query.userId, "userId", ID)
    const items = [...posts.values()].filter(
      (post) => userId === undefined || post.userId === userId
    )
    res.json({ data: items, total: items.length })
  })

  router.get("/:id", (req, res) => {
    const id = wholeNumber(req.params.id, "id", ID)
    const post = posts.get(id)
    if (post === undefined) throw new Refusal(404, "NOT_FOUND", `No post #${id}`)
    res.json(post)
  })

  router.post("/", (req, res) => {
    const fields = fieldsOf(req.body)
    const userId = fields.userId === undefined ? 1 : wholeNumber(fields.userId, "userId", ID)
    if (!users.has(userId)) throw new Refusal(404, "NOT_FOUND", `No user #${userId}`)
    const post: Post = {
      id: getNextPostId(),
      userId,
      title: text(fields.title, "title", limits.titleLength),
      body: text(fields.body, "body", limits.bodyLength),
      tags: tagsOf(fields.tags, limits),
      createdAt: new Date().toISOString(),
    }
    posts.set(post.id, post)
    res.status(201).json(post)
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
