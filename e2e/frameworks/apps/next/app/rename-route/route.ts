import { client } from "../../lib/api";

export async function POST(): Promise<Response> {
  const outcome = await client.rename({ name: "Route" }).then(
    () => "written",
    (error: { status?: number }) => `refused ${error.status ?? "?"}`,
  );
  return new Response(outcome);
}
