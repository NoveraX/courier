"use client"

import { Pencil, Trash2 } from "lucide-react"
import { useState } from "react"

import { ResponseViewer } from "@/components/docs/response-viewer"
import { RunButton } from "@/components/run-button"
import { Button } from "@/components/ui/button"
import { q } from "@/lib/query"

type User = {
  id: number
  name: string
  email: string
  role: string
  createdAt: string
}

export function CrudDemo() {
  const [selectedUser, setSelectedUser] = useState<User | null>(null)

  const { data, isLoading, refetch } = q.users.useQuery("getAll", { variables: {} })

  const create = q.users.useMutation("create", {
    onSuccess: () => refetch(),
  })

  const update = q.users.useMutation("update", {
    onSuccess: () => {
      refetch()
      setSelectedUser(null)
    },
  })

  const patch = q.users.useMutation("patch", {
    onSuccess: () => {
      refetch()
      setSelectedUser(null)
    },
  })

  const remove = q.users.useMutation("remove", {
    onSuccess: () => {
      refetch()
      setSelectedUser(null)
    },
  })

  const users: User[] = data?.data ?? []

  return (
    <div className="space-y-4">
      <div className="rounded-lg border">
        <div className="border-b px-4 py-2 text-sm font-medium text-muted-foreground">
          Users {isLoading && "(loading…)"}
        </div>
        <div className="divide-y">
          {users.map((user) => (
            <div key={user.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
              <div className="flex items-center gap-3">
                <span className="font-medium">{user.name}</span>
                <span className="text-muted-foreground">{user.email}</span>
                <span className="rounded bg-muted px-1.5 py-0.5 text-xs">{user.role}</span>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setSelectedUser(user)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate({ id: user.id })}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
          {users.length === 0 && !isLoading && (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              No users. Create one below.
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <RunButton
          loading={create.isPending}
          label="Create User"
          onClick={() =>
            create.mutate({
              name: `User ${Date.now().toString(36)}`,
              email: `user-${Date.now().toString(36)}@example.com`,
            })
          }
        />
        {selectedUser && (
          <>
            <RunButton
              loading={update.isPending}
              label={`PUT Update #${selectedUser.id}`}
              variant="secondary"
              onClick={() =>
                update.mutate({
                  id: selectedUser.id,
                  name: `${selectedUser.name} (updated)`,
                  email: selectedUser.email,
                  role: "moderator",
                })
              }
            />
            <RunButton
              loading={patch.isPending}
              label={`PATCH #${selectedUser.id}`}
              variant="secondary"
              onClick={() =>
                patch.mutate({
                  id: selectedUser.id,
                  name: `${selectedUser.name} (patched)`,
                })
              }
            />
            <Button variant="outline" size="sm" onClick={() => setSelectedUser(null)}>
              Deselect
            </Button>
          </>
        )}
      </div>

      {create.data && <ResponseViewer data={create.data} status={201} />}
      {update.data && <ResponseViewer data={update.data} status={200} />}
      {patch.data && <ResponseViewer data={patch.data} status={200} />}
      {remove.error && <ResponseViewer error={remove.error.message} />}
    </div>
  )
}

export function OperationsInfo() {
  return (
    <div className="space-y-3 text-sm text-muted-foreground">
      <p>
        <strong className="text-foreground">POST</strong> — <code>users:create</code> creates a new
        user
      </p>
      <p>
        <strong className="text-foreground">PUT</strong> — <code>users:update</code> fully replaces
        the user
      </p>
      <p>
        <strong className="text-foreground">PATCH</strong> — <code>users:patch</code> partially
        updates fields
      </p>
      <p>
        <strong className="text-foreground">DELETE</strong> — <code>users:remove</code> deletes the
        user
      </p>
    </div>
  )
}
