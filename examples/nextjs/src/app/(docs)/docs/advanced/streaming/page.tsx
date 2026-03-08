import Link from "next/link"

import { Callout } from "@/components/docs/callout"
import { CodeBlock } from "@/components/docs/code-block"
import { InlineCode } from "@/components/docs/inline-code"
import { Prose } from "@/components/docs/prose"
import { PageHeader } from "@/components/layout/page-header"
import { docsMetadata } from "@/lib/metadata"

const methodCode = `import { type Method, RequestGroup } from "@noverax/nexus/RequestClass"

class Events extends RequestGroup {
  constructor() {
    super({ prefix: "events" })
  }

  // Set stream: true to receive a ReadableStream instead of parsed JSON
  subscribe: Method<ReadableStream, { channel: string }> = ({ get }) =>
    get(":channel/stream", { stream: true })
}

class Exports extends RequestGroup {
  constructor() {
    super({ prefix: "exports" })
  }

  // Large file download as a stream
  download: Method<ReadableStream, { id: string }> = ({ get }) =>
    get(":id/download", { stream: true })
}`

const proxyBehaviorCode = `// In proxy mode, apiRoute returns the stream directly as a Response:
// Browser ← ReadableStream ← apiRoute ← Backend

// The proxy preserves the stream — no buffering in memory
// Headers like Content-Type are forwarded automatically`

const directBehaviorCode = `// In direct mode, the stream is returned in the response object:
// { status: 200, headers: Headers, data: ReadableStream }

import { directRequest } from "@/lib/direct-request"

export default async function ExportPage({ params }: { params: { id: string } }) {
  const response = await directRequest("myApi", { rawData: true })("exports:download", {
    id: params.id,
  })

  // response.data is a ReadableStream
  // response.headers contains Content-Type, Content-Length, etc.
}`

const clientConsumerCode = `"use client"

import { useEffect, useState } from "react"

import { request } from "@/lib/request"

export function EventStream({ channel }: { channel: string }) {
  const [events, setEvents] = useState<string[]>([])

  useEffect(() => {
    let cancelled = false

    async function consume() {
      const response = await request("myApi")("events:subscribe", { channel })
      const reader = (response as ReadableStream).getReader()
      const decoder = new TextDecoder()

      while (!cancelled) {
        const { done, value } = await reader.read()
        if (done) break
        const text = decoder.decode(value, { stream: true })
        setEvents((prev) => [...prev, text])
      }

      reader.releaseLock()
    }

    consume()
    return () => { cancelled = true }
  }, [channel])

  return (
    <ul>
      {events.map((event, i) => (
        <li key={i}>{event}</li>
      ))}
    </ul>
  )
}`

const sseCode = `"use client"

import { useEffect, useState } from "react"

import { request } from "@/lib/request"

type SSEEvent = { event: string; data: string }

function parseSSE(chunk: string): SSEEvent[] {
  return chunk
    .split("\\n\\n")
    .filter(Boolean)
    .map((block) => {
      const lines = block.split("\\n")
      const event = lines.find((l) => l.startsWith("event:"))?.slice(6).trim() ?? "message"
      const data = lines.find((l) => l.startsWith("data:"))?.slice(5).trim() ?? ""
      return { event, data }
    })
}

export function SSEConsumer({ channel }: { channel: string }) {
  const [messages, setMessages] = useState<SSEEvent[]>([])

  useEffect(() => {
    let cancelled = false

    async function consume() {
      const response = await request("myApi")("events:subscribe", { channel })
      const reader = (response as ReadableStream).getReader()
      const decoder = new TextDecoder()

      while (!cancelled) {
        const { done, value } = await reader.read()
        if (done) break
        const text = decoder.decode(value, { stream: true })
        const events = parseSSE(text)
        setMessages((prev) => [...prev, ...events])
      }

      reader.releaseLock()
    }

    consume()
    return () => { cancelled = true }
  }, [channel])

  return (
    <ul>
      {messages.map((msg, i) => (
        <li key={i}>
          <strong>{msg.event}:</strong> {msg.data}
        </li>
      ))}
    </ul>
  )
}`

export const metadata = docsMetadata(
  "Streaming",
  "Receive responses as ReadableStreams for SSE, large downloads, and progressive rendering."
)

export default async function StreamingPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Streaming"
        description="Receive responses as ReadableStreams for SSE, large downloads, and progressive rendering."
      />

      <Prose>
        <h2 id="overview">Overview</h2>

        <p>
          By default, Nexus parses the response body as JSON or text. When you set{" "}
          <InlineCode>stream: true</InlineCode> in the method options, Nexus returns the raw{" "}
          <InlineCode>ReadableStream</InlineCode> from <InlineCode>response.body</InlineCode>{" "}
          instead of parsing it.
        </p>

        <p>
          This is useful for Server-Sent Events (SSE), large file downloads, and any scenario where
          you want to process data incrementally rather than buffering the entire response.
        </p>
      </Prose>

      <Prose>
        <h2 id="defining-stream-methods">Defining stream methods</h2>

        <p>
          Enable streaming by passing <InlineCode>{"{ stream: true }"}</InlineCode> as the second
          argument to any HTTP method (<InlineCode>get</InlineCode>, <InlineCode>post</InlineCode>,
          etc.):
        </p>
      </Prose>

      <CodeBlock code={methodCode} filename="api/events.ts" />

      <Prose>
        <h2 id="proxy-mode">Proxy mode behavior</h2>

        <p>
          In proxy mode, the <InlineCode>apiRoute</InlineCode> handler detects streaming responses
          and returns a <InlineCode>Response</InlineCode> with the stream body and forwarded
          headers. The stream is not buffered in memory — data flows directly from your backend
          through the proxy to the browser.
        </p>
      </Prose>

      <CodeBlock code={proxyBehaviorCode} />

      <Prose>
        <h2 id="direct-mode">Direct mode behavior</h2>

        <p>
          In direct mode, the stream is returned inside the response object. You typically combine{" "}
          <InlineCode>stream: true</InlineCode> with <InlineCode>rawData: true</InlineCode> in
          direct mode to access both the stream and the response headers:
        </p>
      </Prose>

      <CodeBlock code={directBehaviorCode} filename="app/exports/[id]/page.tsx" />

      <Prose>
        <h2 id="consuming-streams">Consuming streams in client components</h2>

        <p>
          Use the standard <InlineCode>ReadableStream</InlineCode> API to consume streamed
          responses. The <InlineCode>getReader()</InlineCode> method gives you a reader that yields
          chunks as they arrive:
        </p>
      </Prose>

      <CodeBlock code={clientConsumerCode} filename="components/event-stream.tsx" />

      <Prose>
        <h2 id="sse-pattern">SSE pattern</h2>

        <p>
          Server-Sent Events follow a specific text format (<InlineCode>event:</InlineCode> and{" "}
          <InlineCode>data:</InlineCode> fields separated by double newlines). Here&apos;s a
          complete SSE consumer with event parsing:
        </p>
      </Prose>

      <CodeBlock code={sseCode} filename="components/sse-consumer.tsx" />

      <Callout variant="info" title="Stream and rawData">
        <p>
          In proxy mode, <InlineCode>stream: true</InlineCode> returns the{" "}
          <InlineCode>ReadableStream</InlineCode> directly as the data value. The{" "}
          <InlineCode>rawData</InlineCode> option has no additional effect since the stream replaces
          normal response parsing entirely.
        </p>
      </Callout>

      <Prose>
        <h2 id="next-steps">Next steps</h2>

        <ul>
          <li>
            <Link href="/docs/advanced/raw-data">Raw Data Mode</Link> — access status codes and
            headers alongside response data
          </li>
          <li>
            <Link href="/docs/advanced/options">Options</Link> — all per-request options including
            stream, rawData, and timeout
          </li>
          <li>
            <Link href="/streaming">Streaming Example</Link> — interactive demo of streaming
            responses
          </li>
        </ul>
      </Prose>
    </div>
  )
}
