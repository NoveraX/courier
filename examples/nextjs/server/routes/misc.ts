import { Router } from "express";
import { posts, users } from "../data.js";

const router = Router();

// Nested path params: /users/:id/posts/:postId
router.get("/users/:id/posts/:postId", (req, res) => {
  const user = users.get(Number(req.params.id));
  if (!user) {
    res.status(404).json({ success: false, message: "User not found" });
    return;
  }

  const post = posts.get(Number(req.params.postId));
  if (!post || post.userId !== user.id) {
    res.status(404).json({ success: false, message: "Post not found for this user" });
    return;
  }

  res.json({ user, post });
});

// Streaming response
router.get("/stream", (_req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const items = ["Hello", "from", "the", "streaming", "endpoint!"];
  let index = 0;

  const interval = setInterval(() => {
    if (index < items.length) {
      res.write(`data: ${JSON.stringify({ chunk: items[index], index })}\n\n`);
      index++;
    } else {
      res.write("data: [DONE]\n\n");
      clearInterval(interval);
      res.end();
    }
  }, 500);

  res.on("close", () => clearInterval(interval));
});

// Slow response (3s delay)
router.get("/slow", (_req, res) => {
  setTimeout(() => {
    res.json({ success: true, message: "This response was delayed by 3 seconds" });
  }, 3000);
});

// Return specific HTTP error code
router.get("/error/:code", (req, res) => {
  const code = Number(req.params.code);
  if (code < 400 || code > 599) {
    res.status(400).json({ success: false, message: "Code must be between 400 and 599" });
    return;
  }

  res.status(code).json({
    success: false,
    message: `Intentional ${code} error`,
    code,
  });
});

export default router;
