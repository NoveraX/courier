"use client"

import { useActionState, useId } from "react"

import { ResponseView } from "@/site/sandbox/response-view"
import { RunButton } from "@/site/sandbox/run-button"
import { Sandbox } from "@/site/sandbox/sandbox"
import { SandboxField } from "@/site/sandbox/sandbox-field"

import { type ActionState, createUser } from "./actions"

export function CreateUserForm() {
  const [state, action, isPending] = useActionState<ActionState, FormData>(createUser, {})
  const roleId = useId()
  return (
    <Sandbox
      label="createUser — a Server Action"
      controls={
        <form action={action} className="flex flex-col gap-3.5">
          <SandboxField label="name" name="name" placeholder="Jane Doe" required />
          <SandboxField
            label="email"
            name="email"
            type="email"
            placeholder="jane@example.com"
            required
          />
          <div>
            <label htmlFor={roleId} className="mb-1.5 block font-mono text-meta text-fg-muted">
              role
            </label>
            <select
              id={roleId}
              name="role"
              defaultValue="user"
              className="h-8.5 w-full cursor-pointer rounded-[7px] border border-line bg-bg-subtle px-2 font-mono text-small text-fg outline-none focus-visible:border-brand"
            >
              <option value="user">user</option>
              <option value="admin">admin</option>
              <option value="moderator">moderator</option>
            </select>
          </div>
          <RunButton type="submit" loading={isPending} label="Create" />
        </form>
      }
      result={
        <ResponseView
          data={state.success ? state.data : undefined}
          error={state.error}
          pending={isPending}
        />
      }
    />
  )
}
