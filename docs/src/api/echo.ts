import { defineGroup, endpoint } from "@noverax/courier/define"

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
    send: endpoint<EchoResponse, Record<string, unknown>>()((http, vars) => http.post("", vars)),
    retrieve: endpoint<EchoResponse, Record<string, unknown>>()((http) => http.get()),
  },
})

export type { EchoResponse }
