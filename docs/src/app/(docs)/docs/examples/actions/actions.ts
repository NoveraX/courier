"use server"

import { revalidatePath } from "next/cache"
import { call } from "@/lib/caller"

export type ActionState = {
  success?: boolean
  error?: string
  data?: unknown
}

export async function createUser(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const name = formData.get("name") as string
  const email = formData.get("email") as string
  const role = (formData.get("role") as string) || "user"

  if (!name?.trim() || !email?.trim()) {
    return { error: "Name and email are required." }
  }

  try {
    const user = await call("api")("users:create", { name, email, role })
    revalidatePath("/docs/examples/actions")
    return { success: true, data: user }
  } catch {
    return { error: "Failed to create user." }
  }
}

export async function deleteUser(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = Number(formData.get("id"))

  if (!id || Number.isNaN(id)) {
    return { error: "Invalid user ID." }
  }

  try {
    await call("api")("users:remove", { id })
    revalidatePath("/docs/examples/actions")
    return { success: true, data: { id } }
  } catch {
    return { error: `Failed to delete user #${id}.` }
  }
}
