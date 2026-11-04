import { Router } from "express"

/**
 * The encoding example's endpoint: the request as it arrived — its method,
 * its address and query, the type and the body it was sent with — so a
 * page sees what its serializers made of a call.
 *
 * @returns The router, mounted at `/echo`
 * @example
 * ```ts
 * app.use("/echo", echoRouter())
 * ```
 */
export function echoRouter(): Router {
  const router = Router()
  router.all("/", (req, res) => {
    const query = req.originalUrl.indexOf("?")
    res.json({
      method: req.method,
      url: req.originalUrl,
      contentType: req.headers["content-type"] ?? null,
      body: req.body ?? null,
      query: req.query,
      rawQuery: query === -1 ? null : req.originalUrl.slice(query + 1),
    })
  })
  return router
}
