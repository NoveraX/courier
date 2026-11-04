import { Router } from "express"

import { wholeNumber } from "../fields"

const STREAMED = ["Hello", "from", "the", "streaming", "endpoint!"]
const STREAM_EVERY_MS = 500
const SLOW_MS = 3000

/**
 * The endpoints that show how a call behaves rather than what it holds: a
 * streamed answer, a slow one, and any error a page asks for. A caller
 * that goes away stops the stream and the wait alike.
 *
 * @returns The router, mounted at the root
 * @example
 * ```ts
 * app.use("/", miscRouter())
 * ```
 */
export function miscRouter(): Router {
  const router = Router()

  router.get("/stream", (_req, res) => {
    res.setHeader("Content-Type", "text/event-stream")
    res.setHeader("Connection", "keep-alive")
    let index = 0
    const timer = setInterval(() => {
      if (index < STREAMED.length) {
        res.write(`data: ${JSON.stringify({ chunk: STREAMED[index], index })}\n\n`)
        index += 1
        return
      }
      res.write("data: [DONE]\n\n")
      clearInterval(timer)
      res.end()
    }, STREAM_EVERY_MS)
    res.on("close", () => clearInterval(timer))
  })

  router.get("/slow", (_req, res) => {
    const timer = setTimeout(() => {
      res.json({ success: true, message: "This response was delayed by 3 seconds" })
    }, SLOW_MS)
    res.on("close", () => clearTimeout(timer))
  })

  router.get("/error/:code", (req, res) => {
    const code = wholeNumber(req.params.code, "code", { min: 400, max: 599 })
    res.status(code).json({ success: false, message: `Intentional ${code} error`, code })
  })

  return router
}
