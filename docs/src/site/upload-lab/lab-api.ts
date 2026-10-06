import { createCaller } from "@noverax/courier"
import { courier, defineApi, defineGroup } from "@noverax/courier/define"

const { endpoint } = courier()

/** What the lab answers: the bytes it read, and how long it took to read them. */
export interface LabAnswer {
  received: number
  ms: number
}

const lab = defineGroup({
  prefix: "upload-lab",
  endpoints: {
    send: endpoint.post("").variables<FormData>().response<LabAnswer>(),
  },
})

/**
 * A caller for the lab's endpoint on this site. The page calls it straight,
 * not through the proxy route: the lab sets the pace of the very hop the
 * browser reports, and the proxy would read the upload whole first.
 *
 * @param origin - The page's origin, which the endpoint shares
 * @returns The caller
 * @example
 * ```ts
 * await labCaller(location.origin).lab.with({ onUploadProgress }).send(form)
 * ```
 */
export function labCaller(origin: string) {
  return createCaller(defineApi({ baseURL: `${origin}/api`, groups: { lab } }))
}
