"use client"

import { useState } from "react"

import { ResponseViewer } from "@/components/docs/response-viewer"
import { RunButton } from "@/components/run-button"
import { caller } from "@/lib/query"

type RawResponse = {
  status: number
  headers: unknown
  data: unknown
}

export function NormalFetchDemo() {
  const [data, setData] = useState<unknown>(null)
  const [loading, setLoading] = useState(false)

  const handleFetch = async () => {
    setLoading(true)
    setData(null)
    try {
      const result = await caller("api")("users:getAll", {})
      setData(result)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <RunButton loading={loading} label="Fetch Users" onClick={handleFetch} />
      {data && <ResponseViewer data={data} status={200} />}
    </>
  )
}

export function RawFetchDemo() {
  const [result, setResult] = useState<RawResponse | null>(null)
  const [loading, setLoading] = useState(false)

  const handleFetch = async () => {
    setLoading(true)
    setResult(null)
    try {
      const data = (await caller("api", { rawData: true })(
        "users:getAll",
        {}
      )) as unknown as RawResponse
      setResult(data)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <RunButton loading={loading} label="Fetch Users (raw)" onClick={handleFetch} />
      {result && <ResponseViewer data={result} status={result.status} />}
    </>
  )
}
