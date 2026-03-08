"use client"

import { Loader2, Plus } from "lucide-react"
import { useActionState } from "react"
import { ResponseViewer } from "@/components/response-viewer"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { type ActionState, createUser } from "./actions"

export function CreateUserForm() {
  const [state, action, isPending] = useActionState<ActionState, FormData>(createUser, {})

  return (
    <div className="space-y-4">
      <form action={action} className="grid gap-4 sm:grid-cols-[1fr_1fr_auto_auto]">
        <div className="space-y-1.5">
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" placeholder="Jane Doe" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" placeholder="jane@example.com" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="role">Role</Label>
          <select
            id="role"
            name="role"
            defaultValue="user"
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="user">User</option>
            <option value="admin">Admin</option>
            <option value="moderator">Moderator</option>
          </select>
        </div>
        <div className="flex items-end">
          <Button type="submit" size="sm" disabled={isPending} className="gap-1.5">
            {isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            Create
          </Button>
        </div>
      </form>

      {state.error ? <ResponseViewer error={state.error} /> : null}
      {state.success && state.data ? <ResponseViewer data={state.data} status={201} /> : null}
    </div>
  )
}
