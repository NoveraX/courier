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
    stream: endpoint.get("stream").response<ReadableStream>(),
    slow: endpoint.get("slow").response<SlowResponse>(),
    error: endpoint.get("error/:code").variables<{ code: number }>().response<ErrorResponse>(),
  },
})

export type { ErrorResponse, SlowResponse }
