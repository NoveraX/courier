import { accounts } from "../../lib/api";

export default defineEventHandler(async (event) => {
  await accounts.login({ user: "ada" });
  return sendRedirect(event, "/", 303);
});
