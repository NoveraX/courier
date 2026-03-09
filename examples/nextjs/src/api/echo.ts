import { type Endpoint, EndpointGroup } from "@noverax/nexus/datasource"

type EchoResponse = {
  method: string
  url: string
  contentType: string | null
  body: Record<string, unknown> | null
  query: Record<string, unknown>
  rawQuery: string | null
}

export class Echo extends EndpointGroup {
  constructor() {
    super({ prefix: "echo" })
  }

  send: Endpoint<EchoResponse, Record<string, unknown>> = ({ post }) => post()

  retrieve: Endpoint<EchoResponse, Record<string, unknown>> = ({ get }) => get()
}

export type { EchoResponse }
