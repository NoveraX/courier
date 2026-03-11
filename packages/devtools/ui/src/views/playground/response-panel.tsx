import { Loader2, Send } from "lucide-react"

import type { PlaygroundHistoryEntry } from "../../store"

import { formatDuration } from "../../components/ui"
import { JsonTree } from "../../components/json-tree"
import { TimingRow } from "./timing-row"

export function ResponsePanel({
  response,
  responseTab,
  setResponseTab,
}: {
  response: PlaygroundHistoryEntry | null
  responseTab: "body" | "headers" | "timing"
  setResponseTab: (tab: "body" | "headers" | "timing") => void
}) {
  if (!response) {
    return (
      <div className="flex w-1/2 flex-col">
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-text-muted">
          <Send size={32} strokeWidth={1} />
          <p className="text-xs">Select an endpoint and send a request</p>
          <p className="text-[10px] text-text-muted">Cmd+Enter to send</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex w-1/2 flex-col">
      <ResponseHeader
        response={response}
        responseTab={responseTab}
        setResponseTab={setResponseTab}
      />
      <div className="flex-1 overflow-y-auto p-4">
        {responseTab === "body" && <ResponseBody response={response} />}
        {responseTab === "headers" && <ResponseHeaders response={response} />}
        {responseTab === "timing" && <ResponseTiming response={response} />}
      </div>
    </div>
  )
}

function ResponseHeader({
  response,
  responseTab,
  setResponseTab,
}: {
  response: PlaygroundHistoryEntry
  responseTab: "body" | "headers" | "timing"
  setResponseTab: (tab: "body" | "headers" | "timing") => void
}) {
  return (
    <div className="flex items-center gap-2 border-b border-border-default px-4 py-2">
      {response.status === "pending" ? (
        <Loader2 size={14} className="animate-spin text-sky-400" />
      ) : response.status === "success" ? (
        <div className="h-2 w-2 rounded-full bg-emerald-500" />
      ) : (
        <div className="h-2 w-2 rounded-full bg-red-500" />
      )}

      {response.statusCode != null && (
        <span
          className={`font-mono text-xs font-medium ${
            response.statusCode < 300
              ? "text-emerald-400"
              : response.statusCode < 400
                ? "text-amber-400"
                : "text-red-400"
          }`}
        >
          {response.statusCode}
        </span>
      )}

      {response.duration != null && (
        <span className="text-[11px] text-text-muted">
          {formatDuration(response.duration)}
        </span>
      )}

      <div className="ml-auto flex gap-0.5 rounded-lg bg-surface-1 p-0.5">
        {(["body", "headers", "timing"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setResponseTab(tab)}
            className={`rounded px-2 py-0.5 text-[10px] font-medium capitalize transition-colors ${
              responseTab === tab
                ? "bg-surface-2 text-text-primary"
                : "text-text-muted hover:text-text-secondary"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>
    </div>
  )
}

function ResponseBody({ response }: { response: PlaygroundHistoryEntry }) {
  return (
    <div className="text-[11px]">
      {response.response !== undefined ? (
        typeof response.response === "string" ? (
          <pre className="whitespace-pre-wrap text-text-secondary">
            {response.response}
          </pre>
        ) : (
          <JsonTree data={response.response} defaultExpanded={3} />
        )
      ) : (
        <span className="italic text-text-muted">Waiting for response...</span>
      )}
    </div>
  )
}

function ResponseHeaders({ response }: { response: PlaygroundHistoryEntry }) {
  return (
    <div className="space-y-1 text-[11px]">
      {response.responseHeaders &&
      Object.keys(response.responseHeaders).length > 0 ? (
        Object.entries(response.responseHeaders).map(([key, value]) => (
          <div key={key} className="flex gap-2">
            <span className="shrink-0 font-mono text-violet-400">{key}</span>
            <span className="truncate font-mono text-text-secondary">{value}</span>
          </div>
        ))
      ) : (
        <span className="italic text-text-muted">No headers available</span>
      )}
    </div>
  )
}

function ResponseTiming({ response }: { response: PlaygroundHistoryEntry }) {
  return (
    <div className="space-y-2 text-[11px]">
      {response.timing ? (
        <>
          <TimingRow label="Total" value={response.timing.total} total={response.timing.total} color="bg-indigo-500" />
          <TimingRow label="Middleware" value={response.timing.middleware} total={response.timing.total} color="bg-violet-500" />
          <TimingRow label="Fetch" value={response.timing.fetch} total={response.timing.total} color="bg-sky-500" />
          <TimingRow label="Validation" value={response.timing.validation} total={response.timing.total} color="bg-emerald-500" />
        </>
      ) : response.duration != null ? (
        <TimingRow label="Total" value={response.duration} total={response.duration} color="bg-indigo-500" />
      ) : (
        <span className="italic text-text-muted">No timing data</span>
      )}
    </div>
  )
}
