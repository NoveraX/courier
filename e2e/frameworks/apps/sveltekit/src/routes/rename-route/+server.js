import { client } from "$lib/server/api";

export async function POST() {
  const outcome = await client.rename({ name: "Route" }).then(
    () => "written",
    (error) => `refused ${error.status ?? "?"}`,
  );
  return new Response(outcome);
}
