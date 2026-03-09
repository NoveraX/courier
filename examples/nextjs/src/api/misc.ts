import { type Endpoint, EndpointGroup } from "@noverax/nexus/datasource"

type SlowResponse = {
  success: boolean
  message: string
}

type ErrorResponse = {
  success: boolean
  message: string
  code: number
}

export class Misc extends EndpointGroup {
  stream: Endpoint<ReadableStream> = ({ get }) => get("stream")

  slow: Endpoint<SlowResponse> = ({ get }) => get("slow")

  error: Endpoint<ErrorResponse, { code: number }> = ({ get }) => get("error/:code")
}

export type { SlowResponse, ErrorResponse }
