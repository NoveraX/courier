import { defineGroup, endpoint } from "@noverax/nexus/define"

type UploadResponse = {
  success: boolean
  file: {
    originalName: string
    mimeType: string
    size: number
  }
  fields: Record<string, string>
}

export const files = defineGroup({
  prefix: "upload",
  endpoints: {
    upload: endpoint<UploadResponse, FormData>()((http, vars) =>
      http.post("", vars as unknown as Record<string, unknown>)
    ),
  },
})

export type { UploadResponse }
