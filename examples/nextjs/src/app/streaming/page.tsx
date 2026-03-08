"use client"

import { useState } from "react"
import { DemoCard } from "@/components/demo-card"
import { RunButton } from "@/components/run-button"
import { request } from "@/lib/request"

const streamConfigCode = `// Method definition — return type is ReadableStream
class Misc extends RequestGroup {
  stream: Method<ReadableStream> = ({ get }) => get("stream");
}

// Call with stream: true — returns raw Response instead of parsed JSON
const response = await request("mockApi", { stream: true })(
  "misc:stream"
);

// Read the stream
const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  const text = decoder.decode(value, { stream: true });
  // Parse SSE: "data: {...}\\n\\n"
}`

const backendCode = `// Express SSE endpoint
router.get("/stream", (_req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const items = ["Hello", "from", "the", "streaming", "endpoint!"];
  let index = 0;

  const interval = setInterval(() => {
    if (index < items.length) {
      res.write(\`data: \${JSON.stringify({ chunk: items[index], index })}\\n\\n\`);
      index++;
    } else {
      res.write("data: [DONE]\\n\\n");
      clearInterval(interval);
      res.end();
    }
  }, 500);
});`

type StreamChunk = {
  chunk: string
  index: number
}

export default function StreamingPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Streaming</h1>
        <p className="text-muted-foreground mt-1">
          Stream responses progressively with{" "}
          <code className="text-xs bg-muted px-1 py-0.5 rounded">stream: true</code>. Chunks arrive
          in real time via SSE.
        </p>
      </div>

      <DemoCard
        title="Backend — SSE Endpoint"
        description="Express sends Server-Sent Events with 500ms intervals. The proxy forwards the stream to the client."
        code={backendCode}
      >
        <p className="text-sm text-muted-foreground">
          The backend sends 5 chunks at 500ms intervals, then a [DONE] signal. The nexus proxy
          passes the ReadableStream through transparently.
        </p>
      </DemoCard>

      <StreamDemo />

      <DemoCard
        title="Client Usage"
        description="Pass stream: true as an option to get the raw Response with a ReadableStream body."
        code={streamConfigCode}
      >
        <p className="text-sm text-muted-foreground">
          When <code className="text-xs bg-muted px-1 py-0.5 rounded">stream: true</code>, the
          response is not parsed as JSON. You get the raw Response and can read chunks
          incrementally.
        </p>
      </DemoCard>
    </div>
  )
}

function StreamDemo() {
  const [chunks, setChunks] = useState<StreamChunk[]>([])
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  const handleStream = async () => {
    setChunks([])
    setDone(false)
    setLoading(true)

    try {
      const response = (await request("mockApi", { stream: true })(
        "misc:stream"
      )) as unknown as Response

      const reader = response.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ""

      while (true) {
        const { done: readerDone, value } = await reader.read()
        if (readerDone) break

        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split("\n\n")
        buffer = parts.pop() || ""

        for (const part of parts) {
          const line = part.trim()
          if (!line.startsWith("data: ")) continue

          const data = line.slice(6)
          if (data === "[DONE]") {
            setDone(true)
            break
          }

          try {
            const parsed = JSON.parse(data) as StreamChunk
            setChunks((prev) => [...prev, parsed])
          } catch {
            // skip malformed chunks
          }
        }
      }

      setDone(true)
    } catch (error) {
      console.error("Stream error:", error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <DemoCard
      title="Progressive Rendering"
      description="Watch chunks arrive in real time. Each chunk appears as the server sends it."
      code={streamConfigCode}
    >
      <RunButton loading={loading} label="Start Stream" onClick={handleStream} />

      {chunks.length > 0 ? (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {chunks.map((chunk) => (
              <span
                key={chunk.index}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-muted text-sm font-medium animate-in fade-in slide-in-from-bottom-1 duration-300"
              >
                <span className="text-muted-foreground text-xs">#{chunk.index}</span>
                {chunk.chunk}
              </span>
            ))}
          </div>
          {done ? (
            <p className="text-sm text-green-600 dark:text-green-400 font-medium">
              Stream complete — {chunks.length} chunks received
            </p>
          ) : null}
        </div>
      ) : null}
    </DemoCard>
  )
}
