import { type Method, RequestGroup } from "@noverax/nexus/RequestClass"

type SlowResponse = {
  success: boolean
  message: string
}

type ErrorResponse = {
  success: boolean
  message: string
  code: number
}

export class Misc extends RequestGroup {
  stream: Method<ReadableStream> = ({ get }) => get("stream")

  slow: Method<SlowResponse> = ({ get }) => get("slow")

  error: Method<ErrorResponse, { code: number }> = ({ get }) => get("error/:code")
}

export type { SlowResponse, ErrorResponse }
