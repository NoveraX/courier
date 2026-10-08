import { csrfTokenMiddleware } from "@noverax/courier-next/middleware";

import { api } from "./lib/definition";

export const proxy = csrfTokenMiddleware(api);
export const config = { matcher: ["/visit"] };
