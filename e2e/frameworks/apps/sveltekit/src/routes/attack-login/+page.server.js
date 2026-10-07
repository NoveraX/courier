import { client } from "$lib/server/api";

export async function load() {
  const outcome = await client.login({ user: "mallory" }).then(
    () => "written",
    (error) => `refused ${error.status ?? "?"}`,
  );
  return { outcome };
}
