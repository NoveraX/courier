import { courier, defineGroup } from "@noverax/courier/define"

const { mutation } = courier()

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
    upload: mutation
      .variables<FormData>()
      .response<UploadResponse>()
      .via((http, vars) => http.post("", vars)),
  },
})

export type { UploadResponse }
