import { courier, defineGroup } from "@noverax/courier/define"

const { endpoint } = courier()

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
    upload: endpoint.post("").variables<FormData>().response<UploadResponse>(),
  },
})

export type { UploadResponse }
