import { courier, defineGroup } from "@noverax/courier/define"

const { query } = courier()

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
    stream: query.response<ReadableStream>().via((http) => http.get("stream")),
    slow: query.response<SlowResponse>().via((http) => http.get("slow")),
    error: query
      .variables<{ code: number }>()
      .response<ErrorResponse>()
      .via((http) => http.get("error/:code")),
  },
})

export type { SlowResponse, ErrorResponse }
