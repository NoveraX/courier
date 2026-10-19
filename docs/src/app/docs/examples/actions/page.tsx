import { createAction } from "@noverax/courier-next"
import { sources } from "@/api"
import { exampleMetadata } from "@/site/sandbox/example-metadata"
import { ExamplePage } from "@/site/sandbox/example-page"
import { ExampleSection } from "@/site/sandbox/example-section"

import { CreateUserForm } from "./create-form"
import { UserList } from "./user-list"

const action = createAction(sources, "api")

const actionCode = `// app/actions/actions.ts
"use server"

import { createAction } from "@noverax/courier-next"
import { revalidatePath } from "next/cache"
import { sources } from "@/api"

const action = createAction(sources, "api")

export async function createUser(_prev: ActionState, formData: FormData) {
  const name = formData.get("name") as string
  const email = formData.get("email") as string
  const role = formData.get("role") as string

  const user = await action.users.create({ name, email, role })
  revalidatePath("/docs/examples/actions")
  return { success: true, data: user }
}`

const formCode = `// app/actions/create-form.tsx
"use client"

import { useActionState } from "react"
import { createUser } from "./actions"

export function CreateUserForm() {
  const [state, action, isPending] = useActionState(createUser, {})

  return (
    <form action={action}>
      <input name="name" required />
      <input name="email" type="email" required />
      <button type="submit" disabled={isPending}>Create</button>
      {state.data && <pre>{JSON.stringify(state.data)}</pre>}
    </form>
  )
}`

const deleteCode = `// Server action for delete + revalidation
export async function deleteUser(_prev: ActionState, formData: FormData) {
  const id = Number(formData.get("id"))
  await action.users.remove({ id })
  revalidatePath("/docs/examples/actions")
  return { success: true }
}

// Client component with hidden form
function UserRow({ user }) {
  const [state, action, isPending] = useActionState(deleteUser, {})
  return (
    <form action={action}>
      <input type="hidden" name="id" value={user.id} />
      <button type="submit" disabled={isPending}>Delete</button>
    </form>
  )
}`

export const metadata = exampleMetadata("actions")

export default async function ActionsExamplesPage() {
  const users = await action.users.getAll()

  return (
    <ExamplePage name="actions">
      <ExampleSection
        title="Server Action Definition"
        description='Define actions in a "use server" file. call runs on the server, revalidatePath refreshes the page.'
        code={actionCode}
        learnMore={{ href: "/docs/server-side/actions", label: "Server Actions docs" }}
      >
        <p className="m-0 text-body text-fg-muted">
          Server Actions run on the server. They call the backend directly through{" "}
          <code>createAction</code>, then <code>revalidatePath</code> renders the page&apos;s server
          data again.
        </p>
      </ExampleSection>

      <ExampleSection
        title="Create User"
        description="useActionState connects the form to the server action. Pending state and results are handled automatically."
        code={formCode}
      >
        <CreateUserForm />
      </ExampleSection>

      <ExampleSection
        title="User List + Delete"
        description="Server-fetched list with per-row delete actions. Deleted rows disappear after revalidation."
        code={deleteCode}
      >
        <UserList users={users.data} />
      </ExampleSection>
    </ExamplePage>
  )
}
