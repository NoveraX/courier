import { defineGroup, endpoint } from "@noverax/courier/define"

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
      http.post("", vars)
    ),
  },
})

export type { UploadResponse }
