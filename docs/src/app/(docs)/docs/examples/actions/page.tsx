import { createAction } from "@noverax/nexus-next"
import { sources } from "@/api"
import { ExampleBlock } from "@/components/docs/example-block"
import { PageHeader } from "@/components/layout/page-header"
import { docsMetadata } from "@/lib/metadata"

import { CreateUserForm } from "./create-form"
import { UserList } from "./user-list"

const action = createAction(sources, "api")

type UsersResponse = {
  data: { id: number; name: string; email: string; role: string; createdAt: string }[]
  total: number
  page: number
  limit: number
}

const actionCode = `// app/actions/actions.ts
"use server"

import { createAction } from "@noverax/nexus-next"
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

export const metadata = docsMetadata(
  "Server Actions",
  "Mutate data with Server Actions + direct mode. The page revalidates automatically after each action."
)

export default async function ActionsExamplesPage() {
  const users = (await action.users.getAll({})) as UsersResponse

  return (
    <>
      <PageHeader
        title="Server Actions"
        description="Mutate data with Server Actions + direct mode. The page revalidates automatically after each action."
        mode="direct"
      />

      <div className="space-y-8">
        <ExampleBlock
          title="Server Action Definition"
          description='Define actions in a "use server" file. call runs on the server, revalidatePath refreshes the page.'
          code={actionCode}
          learnMoreHref="/docs/server-side/actions"
          learnMoreLabel="Server Actions docs"
        >
          <p className="text-sm text-muted-foreground">
            Server Actions run entirely on the server. They use{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">createAction</code> to call the
            backend directly, then{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">revalidatePath</code> to refresh
            server-rendered data.
          </p>
        </ExampleBlock>

        <ExampleBlock
          title="Create User"
          description="useActionState connects the form to the server action. Pending state and results are handled automatically."
          code={formCode}
        >
          <CreateUserForm />
        </ExampleBlock>

        <ExampleBlock
          title="User List + Delete"
          description="Server-fetched list with per-row delete actions. Deleted rows disappear after revalidation."
          code={deleteCode}
        >
          <UserList users={users.data} />
        </ExampleBlock>
      </div>
    </>
  )
}
