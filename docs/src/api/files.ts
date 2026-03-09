import { type Endpoint, EndpointGroup } from "@noverax/nexus/datasource"

type UploadResponse = {
  success: boolean
  file: {
    originalName: string
    mimeType: string
    size: number
  }
  fields: Record<string, string>
}

export class Files extends EndpointGroup {
  constructor() {
    super({ prefix: "upload" })
  }

  upload: Endpoint<UploadResponse, FormData> = ({ post }) => post()
}

export type { UploadResponse }
