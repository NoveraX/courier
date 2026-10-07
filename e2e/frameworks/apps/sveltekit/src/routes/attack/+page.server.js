import { client } from "$lib/server/api";

export async function load() {
  const outcome = await client.rename({ name: "Mallory" }).then(
    () => "written",
    (error) => `refused ${error.status ?? "?"}`,
  );
  return { outcome };
}
