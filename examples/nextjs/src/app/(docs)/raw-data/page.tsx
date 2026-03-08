"use client"

import { useState } from "react"
import { DemoCard } from "@/components/demo-card"
import { ResponseViewer } from "@/components/response-viewer"
import { RunButton } from "@/components/run-button"
import { request } from "@/lib/request"

const normalCode = `// Default — returns just the data
const users = await request("mockApi")("users:getAll", {});
// → { data: [...], total: 3 }`

const rawDataCode = `// rawData: true — returns { status, headers, data }
const response = await request("mockApi", { rawData: true })(
  "users:getAll", {}
);

// response.status  → 200
// response.headers → { "content-type": "application/json", ... }
// response.data    → { data: [...], total: 3 }`

const typeCode = `// TypeScript type changes based on rawData flag
type MethodRequestResponse<T extends boolean, R> = Promise<
  T extends true
    ? Partial<MethodKyResponse<R>>  // { status, headers, data }
    : R                              // just the data
>;

// Usage with type safety:
const data = await request("mockApi")("users:getAll", {});
//    ^? { data: User[], total: number }

const raw = await request("mockApi", { rawData: true })(
  "users:getAll", {}
);
//    ^? { status?: number, headers?: Headers, data?: ... }`

type RawResponse = {
  status: number
  headers: unknown
  data: unknown
}

export default function RawDataPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Raw Data Mode</h1>
        <p className="text-muted-foreground mt-1">
          Access full response metadata with{" "}
          <code className="text-xs bg-muted px-1 py-0.5 rounded">rawData: true</code> — status code,
          headers, and data in one object.
        </p>
      </div>

      <ComparisonDemo />

      <DemoCard
        title="Type Safety"
        description="TypeScript infers the return type based on the rawData flag."
        code={typeCode}
      >
        <p className="text-sm text-muted-foreground">
          With <code className="text-xs bg-muted px-1 py-0.5 rounded">rawData: true</code>, the
          return type wraps data in a{" "}
          <code className="text-xs bg-muted px-1 py-0.5 rounded">MethodKyResponse</code> object with
          status and headers. Without it, you get the data directly.
        </p>
      </DemoCard>
    </div>
  )
}

function ComparisonDemo() {
  const [normalData, setNormalData] = useState<unknown>(null)
  const [rawResult, setRawResult] = useState<RawResponse | null>(null)
  const [loadingNormal, setLoadingNormal] = useState(false)
  const [loadingRaw, setLoadingRaw] = useState(false)

  const fetchNormal = async () => {
    setLoadingNormal(true)
    setNormalData(null)
    try {
      const data = await request("mockApi")("users:getAll", {})
      setNormalData(data)
    } finally {
      setLoadingNormal(false)
    }
  }

  const fetchRaw = async () => {
    setLoadingRaw(true)
    setRawResult(null)
    try {
      const data = (await request("mockApi", { rawData: true })(
        "users:getAll",
        {}
      )) as unknown as RawResponse
      setRawResult(data)
    } finally {
      setLoadingRaw(false)
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <DemoCard title="Normal Mode" description="Returns just the response data." code={normalCode}>
        <RunButton loading={loadingNormal} label="Fetch Users" onClick={fetchNormal} />
        {normalData ? <ResponseViewer data={normalData} status={200} /> : null}
      </DemoCard>

      <DemoCard
        title="Raw Data Mode"
        description="Returns status, headers, and data."
        code={rawDataCode}
      >
        <RunButton loading={loadingRaw} label="Fetch Users (raw)" onClick={fetchRaw} />
        {rawResult ? <ResponseViewer data={rawResult} status={rawResult.status} /> : null}
      </DemoCard>
    </div>
  )
}
