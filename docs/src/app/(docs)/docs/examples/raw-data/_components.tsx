"use client"

import { useState } from "react"
import type { HttpResponse } from "@noverax/courier"

import { ResponseViewer } from "@/components/docs/response-viewer"
import { RunButton } from "@/components/run-button"
import { caller } from "@/lib/caller"

export function NormalFetchDemo() {
  const [data, setData] = useState<unknown>(null)
  const [loading, setLoading] = useState(false)

  const handleFetch = async () => {
    setLoading(true)
    setData(null)
    try {
      const result = await caller.users.getAll()
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
  const [result, setResult] = useState<Partial<HttpResponse> | null>(null)
  const [loading, setLoading] = useState(false)

  const handleFetch = async () => {
    setLoading(true)
    setResult(null)
    try {
      const data = await caller.users.raw.getAll()
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
