"use server"

import { createAction } from "@noverax/courier-next"
import { revalidatePath } from "next/cache"
import { sources } from "@/api"
import { traced } from "@/site/inspector/server/traced"
import type { CallTrace } from "@/site/inspector/trace"
import { actionFailure } from "@/site/sandbox/server-call"

const action = createAction(sources, "api")

export type ActionState = {
  success?: boolean
  error?: string
  data?: unknown
  /** How the action's call went to the API, as the site's server traced it. */
  trace?: CallTrace | undefined
}

export async function createUser(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const name = formData.get("name") as string
  const email = formData.get("email") as string
  const role = (formData.get("role") as string) || "user"

  if (!name?.trim() || !email?.trim()) {
    return { error: "Name and email are required." }
  }

  try {
    const { answer, trace } = await traced("action", () =>
      action.users.create({ name, email, role })
    )
    if (answer.error !== undefined) return { error: answer.error, trace }
    revalidatePath("/docs/examples/actions")
    return { success: true, data: answer.data, trace }
  } catch (failure) {
    return { error: actionFailure(failure, "Failed to create user.") }
  }
}

export async function deleteUser(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = Number(formData.get("id"))

  if (!id || Number.isNaN(id)) {
    return { error: "Invalid user ID." }
  }

  try {
    const { answer, trace } = await traced("action", () => action.users.remove({ id }))
    if (answer.error !== undefined) return { error: answer.error, trace }
    revalidatePath("/docs/examples/actions")
    return { success: true, data: { id }, trace }
  } catch (failure) {
    return { error: actionFailure(failure, `Failed to delete user #${id}.`) }
  }
}
