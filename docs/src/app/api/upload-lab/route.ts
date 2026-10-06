import { isLabPace, LAB_MAX_BYTES, LAB_PACE_HEADER, MB } from "@/site/upload-lab/lab-settings"
import { takeLabSlot } from "./lab-slots"
import { LabRefusal, readPaced } from "./paced-read"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/* Long enough for the largest upload at the slowest pace, with room for a slow link. */
const DEADLINE_MS = 30_000

const refuse = (status: number, error: string, headers?: Record<string, string>) =>
  Response.json({ error }, { status, headers })

/* What stops an upload before a byte of it is read, if anything does. */
function refusalOf(request: Request): Response | null {
  const site = request.headers.get("sec-fetch-site")
  if (site !== null && site !== "same-origin") {
    return refuse(403, "The lab takes uploads from this site's pages")
  }
  if (!isLabPace(Number(request.headers.get(LAB_PACE_HEADER)))) {
    return refuse(400, `Name the pace in ${LAB_PACE_HEADER}: 1, 2 or 4 MB a second`)
  }
  const length = Number(request.headers.get("content-length"))
  if (!Number.isInteger(length) || length <= 0) {
    return refuse(411, "The lab needs the upload's length")
  }
  if (length > LAB_MAX_BYTES) return refuse(413, "The upload is larger than the lab takes")
  return null
}

/**
 * The upload guide's lab: takes a reader's upload at the pace the page
 * names, as a slow link would, counts it and drops it. Reading slowly
 * holds the socket back, so the browser's own progress reports follow the
 * pace — which only holds while every proxy in front of the site streams
 * the upload through rather than buffering it first.
 *
 * @param request - A multipart upload naming its pace
 * @returns The bytes read and how long that took, or why the upload was refused
 */
export async function POST(request: Request): Promise<Response> {
  const refusal = refusalOf(request)
  if (refusal) return refusal
  const release = takeLabSlot()
  if (!release) return refuse(429, "The lab is reading other uploads", { "retry-after": "5" })
  try {
    const pace = Number(request.headers.get(LAB_PACE_HEADER))
    const read = await readPaced(request.body, {
      bytesPerSecond: pace * MB,
      limit: LAB_MAX_BYTES,
      deadline: DEADLINE_MS,
    })
    return Response.json(read, { headers: { "cache-control": "no-store" } })
  } catch (error) {
    if (error instanceof LabRefusal) return refuse(error.status, error.message)
    /* The visitor left mid-upload: there is no one to answer. */
    if (request.signal.aborted) return new Response(null, { status: 499 })
    throw error
  } finally {
    release()
  }
}
