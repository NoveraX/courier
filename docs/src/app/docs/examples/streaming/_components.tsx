"use client"

import { useState } from "react"

import { caller } from "@/lib/caller"
import { RequestInspector } from "@/site/inspector/request-inspector"
import { duration } from "@/site/inspector/summary"
import { RunButton } from "@/site/sandbox/run-button"
import { Sandbox } from "@/site/sandbox/sandbox"

interface StreamChunk {
  chunk: string
  index: number
}

/** A chunk, and when it reached the page, in ms after the call was made. */
interface ArrivedChunk extends StreamChunk {
  at: number
}

function chunkOf(data: string): StreamChunk | null {
  try {
    const parsed: unknown = JSON.parse(data)
    if (typeof parsed !== "object" || parsed === null) return null
    if (!("chunk" in parsed) || !("index" in parsed)) return null
    const { chunk, index } = parsed
    return typeof chunk === "string" && typeof index === "number" ? { chunk, index } : null
  } catch (error) {
    console.warn("A stream event was not JSON; leaving it out", error)
    return null
  }
}

export function StreamDemo() {
  const [chunks, setChunks] = useState<ArrivedChunk[]>([])
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const start = async () => {
    setChunks([])
    setDone(false)
    setError(undefined)
    setLoading(true)
    const sent = performance.now()
    try {
      const reader = (await caller.misc.with({ stream: true }).stream()).getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      for (let read = await reader.read(); !read.done; read = await reader.read()) {
        buffer += decoder.decode(read.value, { stream: true })
        const events = buffer.split("\n\n")
        buffer = events.pop() ?? ""
        for (const event of events) {
          const line = event.trim()
          if (!line.startsWith("data: ") || line === "data: [DONE]") continue
          const chunk = chunkOf(line.slice("data: ".length))
          const at = performance.now() - sent
          if (chunk) setChunks((shown) => [...shown, { ...chunk, at }])
        }
      }
      setDone(true)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The stream failed")
    } finally {
      setLoading(false)
    }
  }
  return (
    <Sandbox
      label="caller.misc.with({ stream: true }).stream()"
      controls={
        <RunButton loading={loading} label="Start the stream" onClick={() => void start()} />
      }
      inspector={<RequestInspector calls={["api.misc.stream"]} />}
      result={
        <div className="flex flex-col gap-3">
          <p className="m-0 font-mono text-meta">
            {error ? (
              <span className="text-err">{error}</span>
            ) : done ? (
              <span className="text-ok">complete · {chunks.length} chunks</span>
            ) : (
              <span className="text-fg-subtle">{loading ? "streaming…" : "idle"}</span>
            )}
          </p>
          <ol
            aria-label="Chunks"
            className="m-0 flex min-h-10 list-none flex-wrap gap-1.5 rounded-control border border-line bg-bg-subtle p-3"
          >
            {chunks.map((chunk) => (
              <li
                key={chunk.index}
                className="inline-flex animate-site-in items-center gap-1.5 rounded-chip bg-raised px-2.5 py-1 text-control text-fg"
              >
                <span className="font-mono text-[11px] text-fg-subtle">#{chunk.index}</span>
                {chunk.chunk}
                <span className="font-mono text-[11px] text-fg-subtle">
                  +{Math.round(chunk.at)} ms
                </span>
              </li>
            ))}
          </ol>
          <p className="m-0 text-[11.5px] text-fg-subtle">
            Each chunk with the time it reached the page after the call was made
            {chunks.length > 1 &&
              `: ${duration((chunks.at(-1)?.at ?? 0) - (chunks[0]?.at ?? 0))} from the first to the last`}
            . This call reads one streamed answer: it does not reconnect.
          </p>
        </div>
      }
    />
  )
}
