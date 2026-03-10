"use client"

import { ResponseViewer } from "@/components/docs/response-viewer"
import { useQuery } from "@/lib/query"

export function GroupInfo() {
  return (
    <div className="space-y-3 text-sm">
      <div className="rounded-lg border p-3">
        <p className="font-medium">Users group</p>
        <p className="text-muted-foreground">
          prefix: <code>"users"</code> → all methods hit <code>/users/*</code>
        </p>
        <p className="mt-1 text-muted-foreground">
          Methods: getAll, getById, create, update, patch, remove
        </p>
      </div>
      <div className="rounded-lg border p-3">
        <p className="font-medium">Posts group</p>
        <p className="text-muted-foreground">
          prefix: <code>"posts"</code> → all methods hit <code>/posts/*</code>
        </p>
        <p className="mt-1 text-muted-foreground">Methods: getAll, getById, create</p>
      </div>
      <div className="rounded-lg border p-3">
        <p className="font-medium">Misc group</p>
        <p className="text-muted-foreground">
          prefix: <code>none</code> → methods hit root paths directly
        </p>
        <p className="mt-1 text-muted-foreground">Methods: stream, slow, error</p>
      </div>
    </div>
  )
}

export function GroupsDemo() {
  const users = useQuery("api", "users:getAll", { variables: {} })
  const posts = useQuery("api", "posts:getAll", { variables: {} })
  const singleUser = useQuery("api", "users:getById", { variables: { id: 1 } })

  const isLoading = users.isLoading || posts.isLoading || singleUser.isLoading

  return (
    <>
      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">users:getAll</p>
        {users.data && <ResponseViewer data={users.data} status={200} />}
      </div>
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">posts:getAll</p>
        {posts.data && <ResponseViewer data={posts.data} status={200} />}
      </div>
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">users:getById (id: 1)</p>
        {singleUser.data && <ResponseViewer data={singleUser.data} status={200} />}
      </div>
    </>
  )
}
