"use server";
import { redirect } from "@solidjs/router";

import { accounts, outcome } from "./accounts";

export async function me(): Promise<unknown> {
  return accounts.me();
}

export async function renewed(): Promise<{ first: unknown; second: unknown }> {
  const first = await accounts.me();
  return { first, second: await accounts.me() };
}

export async function signIn(): Promise<never> {
  await accounts.login({ user: "ada" });
  throw redirect("/", { headers: { "Set-Cookie": "signed_in=yes; Path=/" } });
}

export async function rename(): Promise<never> {
  await accounts.rename({ name: "Ada Lovelace" });
  throw redirect("/");
}

export async function renameForAnotherSite(): Promise<string> {
  return outcome(accounts.rename({ name: "Mallory" }));
}

export async function signInForAnotherSite(): Promise<string> {
  return outcome(accounts.login({ user: "mallory" }));
}
