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
    /* The slow endpoint, waited for a second on the server and asked once more when it is late. */
    slowRetried: endpoint
      .get("slow")
      .timeout(1000)
      .retry({ limit: 1, delay: 200, jitter: "none", retryOn: ["timeout"] })
      .response<SlowResponse>(),
    /* The error endpoint, asked twice more when the API answers 503, 300 ms after each attempt. */
    flaky: endpoint
      .get("error/:code")
      .variables<{ code: number }>()
      .retry({ limit: 2, delay: 300, backoff: "fixed", jitter: "none", retryOn: [503] })
      .response<ErrorResponse>(),
  },
})

export type { ErrorResponse, SlowResponse }
