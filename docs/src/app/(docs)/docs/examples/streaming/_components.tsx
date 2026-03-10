"use client"

import { useState } from "react"

import { RunButton } from "@/components/run-button"
import { caller } from "@/lib/caller"

type StreamChunk = {
  chunk: string
  index: number
}

export function StreamDemo() {
  const [chunks, setChunks] = useState<StreamChunk[]>([])
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  const handleStream = async () => {
    setChunks([])
    setDone(false)
    setLoading(true)

    try {
      const response = await caller.misc.with({ stream: true }).stream()

      const reader = response.getReader()
      if (!reader) return
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
    <>
      <RunButton loading={loading} label="Start Stream" onClick={handleStream} />

      {chunks.length > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {chunks.map((chunk) => (
              <span
                key={chunk.index}
                className="inline-flex items-center gap-1.5 rounded-md bg-muted px-3 py-1.5 text-sm font-medium animate-in fade-in slide-in-from-bottom-1 duration-300"
              >
                <span className="text-xs text-muted-foreground">#{chunk.index}</span>
                {chunk.chunk}
              </span>
            ))}
          </div>
          {done && (
            <p className="text-sm font-medium text-green-600 dark:text-green-400">
              Stream complete — {chunks.length} chunks received
            </p>
          )}
        </div>
      )}
    </>
  )
}
