import { createCaller } from "@noverax/courier";

import { api } from "./api";

/** What server code calls: the upstream itself, with no proxy hop. */
export const serverCaller = createCaller(api);
