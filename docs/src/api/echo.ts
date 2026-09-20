import { courier, defineGroup } from "@noverax/courier/define"

const { endpoint } = courier()

type EchoResponse = {
  method: string
  url: string
  contentType: string | null
  body: Record<string, unknown> | null
  query: Record<string, unknown>
  rawQuery: string | null
}

export const echo = defineGroup({
  prefix: "echo",
  endpoints: {
    send: endpoint
      .variables<Record<string, unknown>>()
      .response<EchoResponse>()
      .post(""),
    retrieve: endpoint
      .variables<Record<string, unknown>>()
      .response<EchoResponse>()
      .get(""),
  },
})

export type { EchoResponse }
