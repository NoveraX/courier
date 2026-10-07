import { accounts } from "../../lib/api";

export default defineEventHandler(async (event) => {
  const outcome = await accounts.rename({ name: "Ada Lovelace" }).then(
    () => "written",
    (error: { status?: number }) => `refused ${error.status ?? "?"}`,
  );
  if (getHeader(event, "accept")?.includes("text/html")) return sendRedirect(event, "/", 303);
  return outcome;
});
