import { DemoCard } from "@/components/demo-card"
import { directRequest } from "@/lib/direct-request"
import { CreateUserForm } from "./create-form"
import { UserList } from "./user-list"

type UsersResponse = {
  data: { id: number; name: string; email: string; role: string; createdAt: string }[]
  total: number
  page: number
  limit: number
}

const actionCode = `// app/actions/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { directRequest } from "@/lib/direct-request";

export async function createUser(_prev: ActionState, formData: FormData) {
  const name = formData.get("name") as string;
  const email = formData.get("email") as string;
  const role = formData.get("role") as string;

  const user = await directRequest("mockApi")("users:create", { name, email, role });
  revalidatePath("/actions");
  return { success: true, data: user };
}`

const formCode = `// app/actions/create-form.tsx
"use client";

import { useActionState } from "react";
import { createUser } from "./actions";

export function CreateUserForm() {
  const [state, action, isPending] = useActionState(createUser, {});

  return (
    <form action={action}>
      <input name="name" required />
      <input name="email" type="email" required />
      <button type="submit" disabled={isPending}>Create</button>
      {state.data && <pre>{JSON.stringify(state.data)}</pre>}
    </form>
  );
}`

const deleteCode = `// Server action for delete + revalidation
export async function deleteUser(_prev: ActionState, formData: FormData) {
  const id = Number(formData.get("id"));
  await directRequest("mockApi")("users:remove", { id });
  revalidatePath("/actions");
  return { success: true };
}

// Client component with hidden form
function UserRow({ user }) {
  const [state, action, isPending] = useActionState(deleteUser, {});
  return (
    <form action={action}>
      <input type="hidden" name="id" value={user.id} />
      <button type="submit" disabled={isPending}>Delete</button>
    </form>
  );
}`

export default async function ActionsPage() {
  const users = (await directRequest("mockApi")("users:getAll", {})) as UsersResponse

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Server Actions</h1>
        <p className="text-muted-foreground mt-1">
          Mutate data with Server Actions + direct mode. The page revalidates automatically after
          each action.
        </p>
      </div>

      <DemoCard
        title="Server Action Definition"
        description="Define actions in a &quot;use server&quot; file. directRequest runs on the server, revalidatePath refreshes the page."
        code={actionCode}
      >
        <p className="text-sm text-muted-foreground">
          Server Actions run entirely on the server. They use <code>directRequest</code> to call the
          backend directly, then <code>revalidatePath</code> to refresh server-rendered data.
        </p>
      </DemoCard>

      <DemoCard
        title="Create User"
        description="useActionState connects the form to the server action. Pending state and results are handled automatically."
        code={formCode}
      >
        <CreateUserForm />
      </DemoCard>

      <DemoCard
        title="User List + Delete"
        description="Server-fetched list with per-row delete actions. Deleted rows disappear after revalidation."
        code={deleteCode}
      >
        <UserList users={users.data} />
      </DemoCard>
    </div>
  )
}
