import { type RequestHandler, Router } from "express"
import multer from "multer"

import type { DemoLimits } from "../limits"
import { invalidField, Refusal } from "../refusal"
import { countedUpload } from "./counted-upload"

/**
 * The upload example's endpoint: one file in the form's `file` field,
 * beside a few short fields, each held to its limit, answered with what
 * arrived. The file is counted as it streams in, and none of it is kept.
 *
 * @param limits - The backend's limits
 * @returns The router, mounted at `/upload`
 * @example
 * ```ts
 * app.use("/upload", uploadRouter(DEMO_LIMITS))
 * ```
 */
export function uploadRouter(limits: DemoLimits): Router {
  const router = Router()
  const single = multer({
    storage: countedUpload(),
    limits: {
      fileSize: limits.uploadBytes,
      files: 1,
      fields: limits.uploadFields,
      fieldSize: limits.uploadFieldBytes,
      parts: limits.uploadFields + 1,
    },
  }).single("file")
  const readForm: RequestHandler = (req, res, next) =>
    single(req, res, (error: unknown) =>
      next(error === undefined ? undefined : refusalOf(error, limits))
    )

  router.post("/", readForm, (req, res) => {
    if (req.file === undefined) throw invalidField("file", "a file, sent in the form's file field")
    res.json({
      success: true,
      file: {
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
      },
      fields: req.body,
    })
  })
  return router
}

/* What stopped the form from being read: a limit it went past, or a form that is not one. */
function refusalOf(error: unknown, limits: DemoLimits): Refusal {
  if (!(error instanceof multer.MulterError)) {
    return new Refusal(400, "INVALID_BODY", "The upload is not a form the backend can read")
  }
  switch (error.code) {
    case "LIMIT_FILE_SIZE":
      return new Refusal(
        413,
        "BODY_TOO_LARGE",
        `The file is larger than the ${limits.uploadBytes / (1024 * 1024)} MiB the backend takes`
      )
    case "LIMIT_FILE_COUNT":
    case "LIMIT_UNEXPECTED_FILE":
      return new Refusal(400, "UPLOAD_REFUSED", "The form carries one file, in its file field")
    case "LIMIT_FIELD_COUNT":
    case "LIMIT_PART_COUNT":
      return new Refusal(413, "UPLOAD_REFUSED", "The form has more fields than the backend reads")
    default:
      return new Refusal(
        413,
        "UPLOAD_REFUSED",
        "A field of the form is longer than the backend reads"
      )
  }
}
