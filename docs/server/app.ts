import express, { type Express, type RequestHandler } from "express"

import { answerFailures, noSuchRoute } from "./answers"
import { SandboxStore } from "./data/sandbox-store"
import { DEMO_LIMITS, type DemoLimits } from "./limits"
import { type RefusalLog, refusalLog } from "./refusal-log"
import { echoRouter } from "./routes/echo"
import { miscRouter } from "./routes/misc"
import { postsRouter } from "./routes/posts"
import { uploadRouter } from "./routes/upload"
import { usersRouter } from "./routes/users"
import { visitsIn } from "./visitor"

/**
 * What the examples' backend runs with: its limits, where each visitor's
 * data is kept, and where it counts what it refuses.
 */
export interface DemoAppOptions {
  limits?: DemoLimits | undefined
  store?: SandboxStore | undefined
  log?: RefusalLog | undefined
}

/* Every answer is made for the call that asked: none is for a cache to keep and hand on. */
const noStore: RequestHandler = (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store")
  next()
}

/**
 * The backend the live examples call, without a port: `index.ts` serves it,
 * and the tests call it as it is.
 *
 * Only the site's own server calls it — the proxy route passes a page's
 * call on, with the page's `Origin`, and the pages and Server Actions call
 * it directly — so it answers whatever origin a call names and sends no
 * CORS headers: no browser calls it, and the proxy decides which pages may
 * call through it. Every answer is JSON, a refusal too, and no answer is
 * one a cache may keep. Each visitor's users and posts are their own, kept
 * in the store under the cookie their first change hands them.
 *
 * @param options - Its limits, its store, and where it counts what it refuses
 * @returns The application
 * @example
 * ```ts
 * createDemoApp().listen(4000, "127.0.0.1")
 * ```
 */
export function createDemoApp({
  limits = DEMO_LIMITS,
  store = new SandboxStore(limits),
  log = refusalLog(),
}: DemoAppOptions = {}): Express {
  const visits = visitsIn(store, limits.lifetimeMs)
  const app = express()
  app.disable("x-powered-by")
  app.set("etag", false)
  app.use(noStore)
  app.use(express.json({ limit: limits.bodyBytes }))
  app.use(
    express.urlencoded({
      extended: true,
      limit: limits.bodyBytes,
      parameterLimit: limits.formFields,
    })
  )

  app.use("/users", usersRouter(limits, visits))
  app.use("/posts", postsRouter(limits, visits))
  app.use("/upload", uploadRouter(limits))
  app.use("/echo", echoRouter())
  app.use("/", miscRouter())
  app.get("/health", (_req, res) => {
    res.json({ status: "ok" })
  })

  app.use(noSuchRoute)
  app.use(answerFailures(log, limits.bodyBytes))
  return app
}
