import express, { type Express } from "express"

import echoRouter from "./routes/echo"
import miscRouter from "./routes/misc"
import postsRouter from "./routes/posts"
import uploadRouter from "./routes/upload"
import usersRouter from "./routes/users"

/**
 * The backend the live examples call, without a port: `index.ts` serves it,
 * and the tests call it as it is.
 *
 * Only the site's own server calls it — the proxy route passes a page's
 * call on, with the page's `Origin`, and the pages and Server Actions call
 * it directly — so it answers whatever origin a call names and sends no
 * CORS headers: no browser calls it, and the proxy decides which pages may
 * call through it.
 *
 * @returns The application
 * @example
 * ```ts
 * createDemoApp().listen(4000, "127.0.0.1")
 * ```
 */
export function createDemoApp(): Express {
  const app = express()
  app.use(express.json())
  app.use(express.urlencoded({ extended: true }))

  app.use("/users", usersRouter)
  app.use("/posts", postsRouter)
  app.use("/upload", uploadRouter)
  app.use("/echo", echoRouter)
  app.use("/", miscRouter)

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() })
  })
  return app
}
