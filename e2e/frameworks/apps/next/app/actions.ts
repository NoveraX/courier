"use server";

import { createAction } from "@noverax/courier-next/actions";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { api, client } from "../lib/api";

const action = createAction({ accounts: api }, "accounts");

export async function login(): Promise<void> {
  await client.login({ user: "ada" });
  (await cookies()).set("signed_in", "yes", { path: "/" });
  revalidatePath("/");
}

export async function rename(form: FormData): Promise<void> {
  await action.rename({ name: String(form.get("name")) });
  revalidatePath("/");
}
