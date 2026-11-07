import { redirect } from "@tanstack/solid-router";
import { createServerFn } from "@tanstack/solid-start";
import { setCookie } from "@tanstack/solid-start/server";

import { outcome } from "./accounts";
import { accounts } from "./accounts.server";

export const getMe = createServerFn().handler(() => accounts.me());

export const getRenewed = createServerFn().handler(async () => {
  const first = await accounts.me();
  return { first, second: await accounts.me() };
});

export const signIn = createServerFn({ method: "POST" }).handler(async () => {
  await accounts.login({ user: "ada" });
  setCookie("signed_in", "yes", { path: "/" });
  throw redirect({ to: "/" });
});

export const rename = createServerFn({ method: "POST" }).handler(async () => {
  await accounts.rename({ name: "Ada Lovelace" });
  throw redirect({ to: "/" });
});

export const renameForAnotherSite = createServerFn().handler(() =>
  outcome(accounts.rename({ name: "Mallory" })),
);

export const signInForAnotherSite = createServerFn().handler(() =>
  outcome(accounts.login({ user: "mallory" })),
);
