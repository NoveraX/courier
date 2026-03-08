import { Router } from "express"
import { getNextPostId, posts } from "../data.js"

const router = Router()

router.get("/", (req, res) => {
  const userId = req.query.userId ? Number(req.query.userId) : undefined

  let items = [...posts.values()]

  if (userId) {
    items = items.filter((p) => p.userId === userId)
  }

  res.json({ data: items, total: items.length })
})

router.get("/:id", (req, res) => {
  const post = posts.get(Number(req.params.id))
  if (!post) {
    res.status(404).json({ success: false, message: "Post not found" })
    return
  }
  res.json(post)
})

router.post("/", (req, res) => {
  const { userId, title, body, tags = [] } = req.body
  if (!title || !body) {
    res.status(400).json({ success: false, message: "title and body are required" })
    return
  }

  const id = getNextPostId()
  const post = { id, userId: userId || 1, title, body, tags, createdAt: new Date().toISOString() }
  posts.set(id, post)
  res.status(201).json(post)
})

export default router
