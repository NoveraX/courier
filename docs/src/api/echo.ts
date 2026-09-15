import { courier, defineGroup } from "@noverax/courier/define"

const { query, mutation } = courier()

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
    send: mutation
      .variables<Record<string, unknown>>()
      .response<EchoResponse>()
      .via((http, vars) => http.post("", vars)),
    retrieve: query
      .variables<Record<string, unknown>>()
      .response<EchoResponse>()
      .via((http) => http.get()),
  },
})

export type { EchoResponse }
