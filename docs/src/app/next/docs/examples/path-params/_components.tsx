"use client"

import { useState } from "react"

import { q } from "@/lib/query"
import { ResponseView } from "@/site/sandbox/response-view"
import { RunButton } from "@/site/sandbox/run-button"
import { Sandbox } from "@/site/sandbox/sandbox"
import { SandboxChoice } from "@/site/sandbox/sandbox-choice"

export function SimpleParamDemo() {
  const [id, setId] = useState(1)
  const { data, isFetching, error, refetch } = q.users.useQuery("getById", {
    variables: { id },
    enabled: false,
  })
  return (
    <Sandbox
      label="caller.users.getById"
      controls={
        <>
          <SandboxChoice label="id" value={id} options={[1, 2, 3]} onChange={setId} />
          <RunButton
            loading={isFetching}
            label={`GET /users/${id}`}
            onClick={() => void refetch()}
          />
        </>
      }
      result={<ResponseView data={data} error={error?.message} pending={isFetching} />}
    />
  )
}

export function NestedParamsDemo() {
  const [id, setId] = useState(1)
  const [postId, setPostId] = useState(1)
  const { data, isFetching, error, refetch } = q.users.useQuery("getUserPost", {
    variables: { id, postId },
    enabled: false,
  })
  return (
    <Sandbox
      label="caller.users.getUserPost"
      controls={
        <>
          <SandboxChoice label="id" value={id} options={[1, 2, 3]} onChange={setId} />
          <SandboxChoice
            label="postId"
            value={postId}
            options={[1, 2, 3, 4]}
            onChange={setPostId}
          />
          <RunButton
            loading={isFetching}
            label={`GET /users/${id}/posts/${postId}`}
            onClick={() => void refetch()}
          />
        </>
      }
      result={<ResponseView data={data} error={error?.message} pending={isFetching} />}
    />
  )
}

export function MixedParamsDemo() {
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(2)
  const { data, isFetching, error, refetch } = q.users.useQuery("getAll", {
    variables: { page, limit },
    enabled: false,
  })
  return (
    <Sandbox
      label="caller.users.getAll"
      controls={
        <>
          <SandboxChoice label="page" value={page} options={[1, 2, 3]} onChange={setPage} />
          <SandboxChoice label="limit" value={limit} options={[1, 2, 5, 10]} onChange={setLimit} />
          <RunButton
            loading={isFetching}
            label={`GET /users?page=${page}&limit=${limit}`}
            onClick={() => void refetch()}
          />
        </>
      }
      result={<ResponseView data={data} error={error?.message} pending={isFetching} />}
    />
  )
}
