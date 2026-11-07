import { courier, defineGroup } from "@noverax/courier/define"

const { endpoint } = courier()

type EchoResponse = {
  method: string
  url: string
  contentType: string | null
  body: Record<string, unknown> | null
  /** The body's bytes as they came, as text: `null` for a call that sent none. */
  rawBody: string | null
  query: Record<string, unknown>
  rawQuery: string | null
}

export const echo = defineGroup({
  prefix: "echo",
  endpoints: {
    send: endpoint.post("").variables<Record<string, unknown>>().response<EchoResponse>(),
    retrieve: endpoint.get("").variables<Record<string, unknown>>().response<EchoResponse>(),
  },
})

export type { EchoResponse }
