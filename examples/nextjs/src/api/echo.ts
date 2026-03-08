import { type Method, RequestGroup } from "@noverax/nexus/RequestClass"

type EchoResponse = {
  method: string
  url: string
  contentType: string | null
  body: Record<string, unknown> | null
  query: Record<string, unknown>
  rawQuery: string | null
}

export class Echo extends RequestGroup {
  constructor() {
    super({ prefix: "echo" })
  }

  send: Method<EchoResponse, Record<string, unknown>> = ({ post }) => post()

  retrieve: Method<EchoResponse, Record<string, unknown>> = ({ get }) => get()
}

export type { EchoResponse }
