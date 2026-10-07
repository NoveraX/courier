import { accounts } from "../../lib/api";

export default defineEventHandler(async (event) => {
  await accounts.logout();
  return sendRedirect(event, "/", 303);
});
