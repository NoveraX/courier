import { courier, defineGroup } from "@noverax/courier/define"

const { endpoint } = courier()

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
    stream: endpoint.response<ReadableStream>().get("stream"),
    slow: endpoint.response<SlowResponse>().get("slow"),
    error: endpoint
      .variables<{ code: number }>()
      .response<ErrorResponse>()
      .get("error/:code"),
  },
})

export type { SlowResponse, ErrorResponse }
