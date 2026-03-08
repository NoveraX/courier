"use client"

import { Pencil, Trash2 } from "lucide-react"
import { useState } from "react"
import { DemoCard } from "@/components/demo-card"
import { ResponseViewer } from "@/components/response-viewer"
import { RunButton } from "@/components/run-button"
import { Button } from "@/components/ui/button"
import { useMutation, useQuery } from "@/lib/request"

const createCode = `const create = useMutation("mockApi", "users:create", {
  onSuccess: () => refetch(), // refresh the list
});

create.mutate({ name: "New User", email: "new@example.com" });`

const updateCode = `const update = useMutation("mockApi", "users:update");

update.mutate({
  id: 1,
  name: "Updated Name",
  email: "updated@example.com",
  role: "moderator",
});`

const patchCode = `const patch = useMutation("mockApi", "users:patch");

// Only send the fields you want to change
patch.mutate({ id: 1, name: "Patched Name" });`

const deleteCode = `const remove = useMutation("mockApi", "users:remove");

remove.mutate({ id: 1 });`

const fullCode = `import { useQuery, useMutation } from "@/lib/request";

// List
const { data, refetch } = useQuery("mockApi", "users:getAll");

// Create
const create = useMutation("mockApi", "users:create", {
  onSuccess: () => refetch(),
});

// Update (PUT — full replace)
const update = useMutation("mockApi", "users:update", {
  onSuccess: () => refetch(),
});

// Patch (PATCH — partial update)
const patch = useMutation("mockApi", "users:patch", {
  onSuccess: () => refetch(),
});

// Delete
const remove = useMutation("mockApi", "users:remove", {
  onSuccess: () => refetch(),
});`

type User = {
  id: number
  name: string
  email: string
  role: string
  createdAt: string
}

export default function CrudPage() {
  const [selectedUser, setSelectedUser] = useState<User | null>(null)

  const { data, isLoading, refetch } = useQuery("mockApi", "users:getAll", { variables: {} })

  const create = useMutation("mockApi", "users:create", {
    onSuccess: () => refetch(),
  })

  const update = useMutation("mockApi", "users:update", {
    onSuccess: () => {
      refetch()
      setSelectedUser(null)
    },
  })

  const patch = useMutation("mockApi", "users:patch", {
    onSuccess: () => {
      refetch()
      setSelectedUser(null)
    },
  })

  const remove = useMutation("mockApi", "users:remove", {
    onSuccess: () => {
      refetch()
      setSelectedUser(null)
    },
  })

  const users: User[] = data?.data ?? []

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">CRUD Operations</h1>
        <p className="text-muted-foreground mt-1">
          Full create, read, update, and delete cycle with useMutation and useQuery.
        </p>
      </div>

      <DemoCard
        title="Full CRUD"
        description="Interactive user management with all HTTP methods."
        code={fullCode}
      >
        <div className="space-y-4">
          {/* User list */}
          <div className="rounded-lg border">
            <div className="border-b px-4 py-2 text-sm font-medium text-muted-foreground">
              Users {isLoading && "(loading…)"}
            </div>
            <div className="divide-y">
              {users.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between px-4 py-2.5 text-sm"
                >
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

          {/* Actions */}
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

          {/* Mutation result */}
          {create.data && <ResponseViewer data={create.data} status={201} />}
          {update.data && <ResponseViewer data={update.data} status={200} />}
          {patch.data && <ResponseViewer data={patch.data} status={200} />}
          {remove.error && <ResponseViewer error={remove.error.message} />}
        </div>
      </DemoCard>

      <DemoCard
        title="Individual Operations"
        description="Code snippets for each CRUD method."
        code={`// CREATE\n${createCode}\n\n// UPDATE (PUT)\n${updateCode}\n\n// PATCH\n${patchCode}\n\n// DELETE\n${deleteCode}`}
      >
        <div className="space-y-3 text-sm text-muted-foreground">
          <p>
            <strong>POST</strong> — <code>users:create</code> creates a new user
          </p>
          <p>
            <strong>PUT</strong> — <code>users:update</code> fully replaces the user
          </p>
          <p>
            <strong>PATCH</strong> — <code>users:patch</code> partially updates fields
          </p>
          <p>
            <strong>DELETE</strong> — <code>users:remove</code> deletes the user
          </p>
        </div>
      </DemoCard>
    </div>
  )
}
