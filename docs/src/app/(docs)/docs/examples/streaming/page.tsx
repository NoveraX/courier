import { ExampleBlock } from "@/components/docs/example-block"
import { PageHeader } from "@/components/layout/page-header"
import { docsMetadata } from "@/lib/metadata"

import { StreamDemo } from "./_components"

const streamConfigCode = `// Endpoint definition — return type is ReadableStream
const misc = defineGroup({
  prefix: "misc",
  endpoints: {
    stream: endpoint.get("stream").response<ReadableStream>(),
  },
})

// Call with stream: true via .with() — returns raw Response instead of parsed JSON
const response = await caller.misc.with({ stream: true }).stream()

// Read the stream
const reader = response.body.getReader()
const decoder = new TextDecoder()

while (true) {
  const { done, value } = await reader.read()
  if (done) break

  const text = decoder.decode(value, { stream: true })
  // Parse SSE: "data: {...}\\n\\n"
}`

const backendCode = `// Express SSE endpoint
router.get("/stream", (_req, res) => {
  res.setHeader("Content-Type", "text/event-stream")
  res.setHeader("Cache-Control", "no-cache")
  res.setHeader("Connection", "keep-alive")

  const items = ["Hello", "from", "the", "streaming", "endpoint!"]
  let index = 0

  const interval = setInterval(() => {
    if (index < items.length) {
      res.write(\`data: \${JSON.stringify({ chunk: items[index], index })}\\n\\n\`)
      index++
    } else {
      res.write("data: [DONE]\\n\\n")
      clearInterval(interval)
      res.end()
    }
  }, 500)
})`

export const metadata = docsMetadata(
  "Streaming",
  "Stream responses progressively with stream: true. Chunks arrive in real time via SSE."
)

export default function StreamingExamplesPage() {
  return (
    <>
      <PageHeader
        title="Streaming"
        description="Stream responses progressively with stream: true. Chunks arrive in real time via SSE."
        mode="both"
      />

      <div className="space-y-8">
        <ExampleBlock
          title="Backend — SSE Endpoint"
          description="Express sends Server-Sent Events with 500ms intervals. The proxy forwards the stream to the client."
          code={backendCode}
          learnMoreHref="/docs/advanced/streaming"
          learnMoreLabel="Streaming docs"
        >
          <p className="text-sm text-muted-foreground">
            The backend sends 5 chunks at 500ms intervals, then a [DONE] signal. The courier proxy
            passes the ReadableStream through transparently.
          </p>
        </ExampleBlock>

        <ExampleBlock
          title="Progressive Rendering"
          description="Watch chunks arrive in real time. Each chunk appears as the server sends it."
          code={streamConfigCode}
        >
          <StreamDemo />
        </ExampleBlock>
      </div>
    </>
  )
}
