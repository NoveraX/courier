import { defineGroup, endpoint } from "@noverax/courier/define"

type SlowResponse = {
  success: boolean
  message: string
}

type ErrorResponse = {
  success: boolean
  message: string
  code: number
}

export const misc = defineGroup({
  prefix: "",
  endpoints: {
    stream: endpoint<ReadableStream>()((http) => http.get("stream")),
    slow: endpoint<SlowResponse>()((http) => http.get("slow")),
    error: endpoint<ErrorResponse, { code: number }>()((http) => http.get("error/:code")),
  },
})

export type { SlowResponse, ErrorResponse }
