import { accounts } from "../../lib/api";

export default defineEventHandler(async (event) => {
  await accounts.login({ user: "ada" });
  setCookie(event, "signed_in", "yes", { path: "/" });
  return sendRedirect(event, "/", 303);
});
